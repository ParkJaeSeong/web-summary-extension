import { getUserConfig, Language } from '@/config'
import { createChatMessage } from '@/core/chat-session'
import { PageChatTurn, startPageChatTurn } from '@/core/page-chat-session'
import { ChatMessage, PageContext, pageContextToPrompt } from '@/core/page-context'
import { t } from '@/i18n'
import { sendRuntimeMessage } from '@/messaging'
import { userErrorMessage } from '@/utils/errors'
import { capturePageContext } from './page-context'

const HOST_ID = 'pagemind-selection-chat-host'

function normalizedSelection() {
  return window.getSelection()?.toString().replace(/\s+/g, ' ').trim().slice(0, 6000) || ''
}

function selectionRect() {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const rect = selection.getRangeAt(0).getBoundingClientRect()
  return rect.width || rect.height ? rect : undefined
}

function placeNearSelection(element: HTMLElement, rect: DOMRect, width: number, height: number) {
  const gap = 8
  element.style.left = `${Math.max(gap, Math.min(rect.right, window.innerWidth - width - gap))}px`
  element.style.top = `${Math.max(
    gap,
    Math.min(rect.bottom + gap, window.innerHeight - height - gap),
  )}px`
}

export function mountSelectionChat() {
  document.getElementById(HOST_ID)?.remove()
  if (!document.documentElement) return

  const host = document.createElement('div')
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: 'closed' })
  const trigger = document.createElement('button')
  const dialog = document.createElement('section')
  const header = document.createElement('header')
  const title = document.createElement('strong')
  const headerActions = document.createElement('div')
  const openPanel = document.createElement('button')
  const close = document.createElement('button')
  const pinned = document.createElement('div')
  const pinnedLabel = document.createElement('strong')
  const pinnedText = document.createElement('span')
  const messagesElement = document.createElement('div')
  const status = document.createElement('p')
  const composer = document.createElement('form')
  const input = document.createElement('textarea')
  const submit = document.createElement('button')
  const style = document.createElement('style')

  trigger.type = 'button'
  trigger.className = 'trigger'
  trigger.textContent = '✦'
  trigger.title = t('askSelectionShort', 'Ask PageMind')
  trigger.hidden = true

  dialog.className = 'dialog'
  dialog.hidden = true
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-label', t('selectionChatTitle', 'Ask about this selection'))
  title.textContent = 'PageMind'
  openPanel.type = 'button'
  openPanel.textContent = t('openSidePanel', 'Open panel')
  close.type = 'button'
  close.className = 'close'
  close.textContent = '×'
  close.setAttribute('aria-label', t('close', 'Close'))
  headerActions.append(openPanel, close)
  header.append(title, headerActions)

  pinned.className = 'pinned'
  pinnedLabel.textContent = t('pinnedSelection', 'Pinned selection')
  pinned.append(pinnedLabel, pinnedText)
  messagesElement.className = 'messages'
  status.className = 'status'
  status.hidden = true
  composer.className = 'composer'
  input.rows = 2
  input.placeholder = t('askSelectionPlaceholder', 'Ask about the selected text…')
  submit.type = 'submit'
  submit.textContent = t('send', 'Send')
  composer.append(input, submit)
  dialog.append(header, pinned, messagesElement, status, composer)

  style.textContent = `
    :host { all: initial; }
    .trigger, .dialog { position: fixed; z-index: 2147483647; font-family: Inter, system-ui, sans-serif; }
    .trigger { width: 34px; height: 34px; border: 1px solid rgba(37,99,235,.24); border-radius: 11px; background: #fff; color: #2563eb; box-shadow: 0 7px 20px rgba(15,23,42,.22); cursor: pointer; font-size: 18px; }
    .dialog { display: grid; grid-template-rows: auto auto minmax(80px,1fr) auto auto; width: min(360px, calc(100vw - 16px)); max-height: min(480px, calc(100vh - 16px)); overflow: hidden; border: 1px solid #dbe3ef; border-radius: 15px; background: #fff; color: #171717; box-shadow: 0 18px 55px rgba(15,23,42,.28); }
    [hidden] { display: none !important; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
    header div { display: flex; gap: 4px; }
    button, textarea { font: inherit; }
    header button { border: 0; border-radius: 7px; padding: 5px 7px; background: #f3f4f6; color: #374151; cursor: pointer; font-size: 11px; }
    header .close { padding: 2px 7px; font-size: 18px; line-height: 1; }
    .pinned { display: grid; gap: 3px; margin: 9px 10px 0; border: 1px solid #bfdbfe; border-radius: 9px; padding: 8px 9px; background: #eff6ff; color: #1e3a8a; }
    .pinned strong { font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
    .pinned span { display: -webkit-box; overflow: hidden; font-size: 12px; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
    .messages { display: grid; align-content: start; gap: 7px; overflow: auto; padding: 10px; }
    .message { max-width: 92%; border-radius: 10px; padding: 8px 9px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.45; }
    .message--user { justify-self: end; background: #e8f0ff; }
    .message--assistant { justify-self: start; background: #f3f4f6; }
    .status { margin: 0; padding: 0 10px 7px; color: #b91c1c; font-size: 11px; }
    .composer { display: flex; gap: 7px; padding: 9px 10px 10px; border-top: 1px solid #e5e7eb; }
    textarea { flex: 1; min-width: 0; resize: none; border: 1px solid #d1d5db; border-radius: 9px; padding: 8px; background: #fff; color: #171717; font-size: 12px; }
    .composer button { border: 0; border-radius: 9px; padding: 0 12px; background: #18181b; color: #fff; cursor: pointer; }
    .composer button:disabled, textarea:disabled { opacity: .5; cursor: default; }
    @media (prefers-color-scheme: dark) {
      .trigger, .dialog { border-color: #3f3f46; background: #202020; color: #f5f5f5; }
      header { border-color: #383838; }
      header button, .message--assistant { background: #303033; color: #f5f5f5; }
      .message--user { background: #172554; }
      .pinned { border-color: #1e40af; background: #172554; color: #dbeafe; }
      .composer { border-color: #383838; }
      textarea { border-color: #444; background: #292929; color: #f5f5f5; }
    }
  `

  shadow.append(style, trigger, dialog)
  document.documentElement.append(host)

  let selectedText = ''
  let pageContext: PageContext | undefined
  let messages: ChatMessage[] = []
  let turn: PageChatTurn | undefined
  let responseLanguage = window.navigator.language
  let conversationSourceKeys: string[] = []
  let openRequest = 0

  const renderMessages = () => {
    messagesElement.replaceChildren()
    messages.slice(-12).forEach((message) => {
      const bubble = document.createElement('div')
      bubble.className = `message message--${message.role}`
      bubble.textContent = message.content || t('thinking', 'Thinking…')
      messagesElement.append(bubble)
    })
    messagesElement.scrollTop = messagesElement.scrollHeight
  }

  const setBusy = (busy: boolean, cancellable = false) => {
    input.disabled = busy
    submit.disabled = busy && !cancellable
    submit.textContent = busy ? t('stop', 'Stop') : t('send', 'Send')
  }

  const closeDialog = () => {
    openRequest += 1
    turn?.cancel()
    turn = undefined
    dialog.hidden = true
    status.hidden = true
    setBusy(false)
  }

  const openDialog = async () => {
    const requestId = ++openRequest
    trigger.hidden = true
    dialog.hidden = false
    pinnedText.textContent = selectedText
    messages = []
    renderMessages()
    status.textContent = t('readingPage', 'Reading page content…')
    status.hidden = false
    setBusy(true)
    placeNearSelection(dialog, selectionRect() || new DOMRect(8, 8), 360, 480)
    try {
      const [context, config, stored] = await Promise.all([
        capturePageContext({}),
        getUserConfig(),
        sendRuntimeMessage({ type: 'GET_CONVERSATION', data: { url: location.href } }),
      ])
      if (requestId !== openRequest) return
      pageContext = context
      responseLanguage =
        config.language === Language.Auto ? window.navigator.language : config.language
      messages = stored?.messages || []
      conversationSourceKeys = stored?.sourceKeys || []
      renderMessages()
      status.hidden = true
      setBusy(false)
      input.focus()
    } catch (error: unknown) {
      if (requestId !== openRequest) return
      status.textContent = userErrorMessage(error, 'CONTENT_UNAVAILABLE')
      status.hidden = false
      setBusy(false)
    }
  }

  const send = () => {
    const question = input.value.trim()
    if (!question || !pageContext || turn) return
    const nextMessages = [...messages, createChatMessage('user', question)]
    const assistant = createChatMessage('assistant', '')
    messages = [...nextMessages, assistant]
    input.value = ''
    status.hidden = true
    renderMessages()
    turn = startPageChatTurn(
      pageContextToPrompt(pageContext, nextMessages, responseLanguage, undefined, selectedText),
      {
        onText(text) {
          messages = [...nextMessages, { ...assistant, content: text }]
          renderMessages()
        },
        onDone(text) {
          turn = undefined
          setBusy(false)
          if (!text) return
          messages = [...nextMessages, { ...assistant, content: text }]
          sendRuntimeMessage({
            type: 'SAVE_CONVERSATION',
            data: {
              conversation: {
                url: pageContext!.url,
                title: pageContext!.title,
                messages,
                sourceKeys: conversationSourceKeys,
                updatedAt: Date.now(),
              },
            },
          }).catch(() => {})
        },
        onError(error) {
          turn = undefined
          setBusy(false)
          status.textContent = userErrorMessage(error, 'CHAT_REQUEST_FAILED')
          status.hidden = false
        },
        onDisconnect() {
          turn = undefined
          setBusy(false)
        },
      },
    )
    setBusy(true, true)
  }

  const showTrigger = () => {
    if (!dialog.hidden) return
    const text = normalizedSelection()
    const rect = selectionRect()
    if (!text || !rect) {
      trigger.hidden = true
      return
    }
    selectedText = text
    trigger.hidden = false
    placeNearSelection(trigger, rect, 34, 34)
  }

  trigger.addEventListener('pointerdown', (event) => event.preventDefault())
  trigger.addEventListener('click', openDialog)
  close.addEventListener('click', closeDialog)
  openPanel.addEventListener('click', () => {
    sendRuntimeMessage({
      type: 'OPEN_SELECTION_IN_SIDE_PANEL',
      data: {
        selection: {
          text: selectedText,
          url: location.href,
          title: document.title,
          createdAt: Date.now(),
        },
      },
    }).catch(() => {})
  })
  composer.addEventListener('submit', (event) => {
    event.preventDefault()
    if (turn) {
      turn.cancel()
      turn = undefined
      setBusy(false)
      return
    }
    send()
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  })
  document.addEventListener('mouseup', () => window.setTimeout(showTrigger))
  document.addEventListener('keyup', (event) => {
    if (event.key.startsWith('Arrow') || event.key === 'Shift') window.setTimeout(showTrigger)
  })
}
