import { getEmbeddingConfig, getProviderConfigs, ProviderType } from '@/config'
import { isPageChatRequest, isRuntimeMessage, PAGE_CHAT_PORT, PageChatEvent } from '@/messaging'
import { errorCode, PageMindError } from '@/utils/errors'
import Browser from 'webextension-polyfill'
import { closeOffscreenDocumentIfIdle, pdfAdapter } from './adapters/pdf'
import { AnthropicProvider } from './providers/anthropic'
import { OpenAICompatibleEmbeddingProvider } from './providers/embeddings'
import { OpenAIProvider } from './providers/openai'
import { Provider } from './types'
import { normalizePinnedSelection, PinnedSelection } from '@/core/chat-session'
import { getConversation, saveConversation } from '@/storage/conversations'
import {
  isLocalHostname,
  parseSafeHttpUrl,
  permissionOrigin,
  samePdfDocumentUrl,
} from '@/utils/url-security'

async function assertProviderAccess(apiHost: string) {
  const url = parseSafeHttpUrl(apiHost)
  const granted = await Browser.permissions.contains({ origins: [permissionOrigin(apiHost)] })
  if (!granted) throw new PageMindError('PROVIDER_PERMISSION_DENIED')
  return url
}

async function generateAnswers(port: Browser.Runtime.Port, question: string) {
  const providerConfigs = await getProviderConfigs()

  const config = providerConfigs.configs[providerConfigs.provider]
  const { apiKey, apiHost } = config
  const providerUrl = await assertProviderAccess(apiHost)
  const isLocalHost = isLocalHostname(providerUrl.hostname)
  if (!apiKey && !isLocalHost) {
    throw new PageMindError('PROVIDER_CONFIG_MISSING')
  }
  let provider: Provider
  if (providerConfigs.provider === ProviderType.Anthropic) {
    provider = new AnthropicProvider(config)
  } else if (providerConfigs.provider === ProviderType.Gemini) {
    provider = new OpenAIProvider(config, { 'x-goog-api-client': 'pagemind-oai/1.7.0' })
  } else {
    provider = new OpenAIProvider(config)
  }

  const controller = new AbortController()
  port.onDisconnect.addListener(() => {
    controller.abort()
    cleanup?.()
  })

  const { cleanup } = await provider.generateAnswer({
    prompt: question,
    signal: controller.signal,
    onEvent(event) {
      if (event.type === 'done') {
        port.postMessage({ event: 'DONE' } satisfies PageChatEvent)
        return
      }
      port.postMessage(event.data)
    },
  })
}

Browser.runtime.onConnect.addListener(async (port) => {
  if (port.name !== PAGE_CHAT_PORT) return
  port.onMessage.addListener(async (msg) => {
    if (!isPageChatRequest(msg)) return
    try {
      await generateAnswers(port, msg.question)
    } catch (error: unknown) {
      port.postMessage({
        error: errorCode(error, 'CHAT_REQUEST_FAILED'),
      } satisfies PageChatEvent)
    }
  })
})

async function generateEmbeddings(texts: string[]) {
  const config = await getEmbeddingConfig()
  const providerUrl = await assertProviderAccess(config.apiHost)
  const isLocalHost = isLocalHostname(providerUrl.hostname)
  if (!config.apiKey && !isLocalHost) {
    throw new PageMindError('PROVIDER_CONFIG_MISSING')
  }
  return new OpenAICompatibleEmbeddingProvider(config).embed(texts)
}

async function openSidePanel(sender: Browser.Runtime.MessageSender) {
  if (typeof chrome === 'undefined' || !chrome.sidePanel) return false
  const tabId = sender.tab?.id
  if (!tabId) throw new Error('The active tab could not be identified.')
  await chrome.sidePanel.open({ tabId })
  return true
}

const ASK_SELECTION_MENU_ID = 'pagemind-ask-selection'

function pendingSelectionKey(tabId: number) {
  return `pendingSelection:${tabId}`
}

async function claimPendingSelection(tabId: number) {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return
  const key = pendingSelectionKey(tabId)
  const values = await chrome.storage.session.get(key)
  await chrome.storage.session.remove(key)
  return values[key] as PinnedSelection | undefined
}

async function openSelectionInSidePanel(tabId: number, selection: PinnedSelection) {
  if (typeof chrome === 'undefined' || !chrome.sidePanel || !chrome.storage?.session) return
  const normalized = normalizePinnedSelection(selection)
  if (!normalized.text) return
  await chrome.storage.session.set({ [pendingSelectionKey(tabId)]: normalized })
  await chrome.sidePanel.open({ tabId })
  Browser.runtime.sendMessage({ type: 'SELECTION_CONTEXT_READY', data: { tabId } }).catch(() => {})
}

async function selectedTextFromTab(tabId: number) {
  if (typeof chrome === 'undefined' || !chrome.scripting) return ''
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => window.getSelection()?.toString().trim() || '',
  })
  return results.map((result) => result.result || '').find(Boolean) || ''
}

async function extractActivePdf(url: string, requestId: string) {
  const [tab] = await Browser.tabs.query({ active: true, currentWindow: true })
  if (!tab.url || !samePdfDocumentUrl(tab.url, url)) {
    throw new PageMindError('PDF_INVALID')
  }
  return pdfAdapter.extract({ url, requestId })
}

// This listener must stay synchronous at the top level and only return a Promise for
// message types it actually handles. Sending a message from the background script itself
// (e.g. GET_PDF_CONTEXT's PARSE_PDF dispatch to the offscreen document) re-delivers that
// message to this same listener; returning a Promise unconditionally would race the real
// handler's response with this listener's own unmatched "undefined" resolution.
Browser.runtime.onMessage.addListener((message, sender) => {
  if (!isRuntimeMessage(message)) return
  if (message.type === 'OPEN_OPTIONS_PAGE') {
    Browser.runtime.openOptionsPage()
    return
  }
  if (message.type === 'GENERATE_EMBEDDINGS') {
    return generateEmbeddings(message.data.texts)
  }
  if (message.type === 'GET_PDF_CONTEXT') {
    return extractActivePdf(message.data.url, message.data.requestId).catch((error: unknown) => ({
      error: errorCode(error, 'PDF_INVALID'),
    }))
  }
  if (message.type === 'OPEN_SIDE_PANEL') {
    return openSidePanel(sender)
  }
  if (message.type === 'OPEN_SELECTION_IN_SIDE_PANEL') {
    const tabId = sender.tab?.id
    if (!tabId || sender.tab?.url !== message.data.selection.url) return Promise.resolve(false)
    return openSelectionInSidePanel(tabId, message.data.selection).then(() => true)
  }
  if (message.type === 'CLAIM_PENDING_SELECTION') {
    return claimPendingSelection(message.data.tabId)
  }
  if (message.type === 'GET_CONVERSATION') {
    return getConversation(message.data.url)
  }
  if (message.type === 'SAVE_CONVERSATION') {
    return saveConversation(message.data.conversation)
  }
  if (message.type === 'OFFSCREEN_IDLE') {
    return closeOffscreenDocumentIfIdle()
  }
})

Browser.runtime.onInstalled.addListener(async (details) => {
  if (typeof chrome !== 'undefined' && chrome.contextMenus) {
    await chrome.contextMenus.removeAll()
    chrome.contextMenus.create({
      id: ASK_SELECTION_MENU_ID,
      contexts: ['selection'],
      title: Browser.i18n.getMessage('askSelectionMenu') || 'Ask PageMind about “%s”',
    })
  }
  if (details.reason === 'install') {
    Browser.runtime.openOptionsPage()
  }
})

if (typeof chrome !== 'undefined' && chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== ASK_SELECTION_MENU_ID || !tab?.id || !info.selectionText) return
    openSelectionInSidePanel(tab.id, {
      text: info.selectionText,
      url: tab.url || '',
      title: tab.title,
      createdAt: Date.now(),
    }).catch(() => {})
  })
}

if (typeof chrome !== 'undefined' && chrome.commands) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'ask-selection') return
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab.id || !tab.url) return
    try {
      const text = await selectedTextFromTab(tab.id)
      if (!text) return
      await openSelectionInSidePanel(tab.id, {
        text,
        url: tab.url,
        title: tab.title,
        createdAt: Date.now(),
      })
    } catch {
      // Restricted browser pages cannot expose a selection to extensions.
    }
  })
}

if (typeof chrome !== 'undefined' && chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
}
