import {
  DEFAULT_PROMPT_ACTIONS,
  getEmbeddingConfig,
  getUserConfig,
  Language,
  PromptAction,
  updateUserConfig,
} from '@/config'
import { createChatMessage, PinnedSelection } from '@/core/chat-session'
import { PageChatTurn, startPageChatTurn } from '@/core/page-chat-session'
import {
  ChatMessage,
  ChunkEmbeddingSearch,
  linkifyChunkCitations,
  multiPageContextToPrompt,
  PageContext,
  pageContextToPrompt,
} from '@/core/page-context'
import {
  createConversationMarkdown,
  createMultiSourceConversationMarkdown,
} from '@/core/markdown-export'
import { isRuntimeMessage, PdfParseProgress, sendRuntimeMessage, sendTabMessage } from '@/messaging'
import { errorCode, errorMessage, PageMindError, userErrorMessage } from '@/utils/errors'
import { safeExternalUrl } from '@/utils/url-security'
import { t } from '@/i18n'
import { recoverPdfAccess } from './pdf-access'
import { pageAccessKind } from './page-access'
import { contentLoadStage, ContentLoadStage, embeddingBatches } from './progress'
import { saveMarkdownToObsidianVault } from './obsidian-export'
import { EmbeddingCheckpoint, indexContentInBatches } from './embedding-index'
import { deleteConversation, getConversation, saveConversation } from '@/storage/conversations'
import {
  PageMemoryEmbedding,
  PageMemoryResult,
  pageMemoryText,
  savePageMemory,
  searchPageMemories,
} from '@/storage/page-memories'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import ReactMarkdown from 'react-markdown'
import Browser from 'webextension-polyfill'
import {
  ContentEmbeddings,
  ContentCacheItemSummary,
  getCachedContent,
  getCachedContentByKey,
  hasCurrentEmbeddings,
  listCachedContent,
  saveCachedContent,
  saveContentEmbeddings,
} from '@/storage/content-cache'

interface SelectedSource {
  key: string
  context: PageContext
  embeddings?: ContentEmbeddings
}

interface OpenTabSource {
  id: number
  url: string
  title: string
}

// Thrown when no content script is reachable in the tab (and injection also fails), or when
// the content script reports it's sitting on Chrome's built-in PDF viewer (its outer document
// has no readable text). Both are the signal used to fall back to the PDF pipeline.
class PdfRedirectError extends Error {}

async function requestPageContext(tabId: number, captionLanguage: string) {
  const request = {
    type: 'GET_PAGE_CONTEXT',
    data: { captionLanguage },
  } as const
  let response: unknown
  try {
    response = await sendTabMessage(tabId, request)
  } catch (error: unknown) {
    const connectionError = errorMessage(error, 'Could not connect to this page.')
    if (!/receiving end does not exist|could not establish connection/i.test(connectionError)) {
      throw error
    }
    if (typeof chrome === 'undefined' || !chrome.scripting) {
      throw new PdfRedirectError(connectionError)
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content-script.js'] })
    } catch (injectError: unknown) {
      throw new PdfRedirectError(errorMessage(injectError, 'Could not connect to this page.'))
    }
    response = await sendTabMessage(tabId, request)
  }
  if (
    typeof response === 'object' &&
    response !== null &&
    'isPdfDocument' in response &&
    response.isPdfDocument === true
  ) {
    throw new PdfRedirectError()
  }
  return response as PageContext
}

function isPdfUrl(url?: string) {
  return !!url && /\.pdf(?:[?#]|$)/i.test(url)
}

async function requestPdfContext(url: string, requestId: string) {
  const result = await sendRuntimeMessage({
    type: 'GET_PDF_CONTEXT',
    data: { url, requestId },
  })
  if ('error' in result) throw new Error(result.error)
  return result
}

export default function App() {
  const [context, setContext] = useState<PageContext>()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [answering, setAnswering] = useState(false)
  const [loadStage, setLoadStage] = useState<ContentLoadStage>('page')
  const [pdfProgress, setPdfProgress] = useState<PdfParseProgress>()
  const [view, setView] = useState<'chat' | 'memory'>('chat')
  const [pageMemoryEnabled, setPageMemoryEnabled] = useState(false)
  const [semanticMemoryEnabled, setSemanticMemoryEnabled] = useState(false)
  const [automaticIndexingEnabled, setAutomaticIndexingEnabled] = useState(false)
  const [responseLanguage, setResponseLanguage] = useState(window.navigator.language)
  const [promptActions, setPromptActions] = useState<PromptAction[]>(DEFAULT_PROMPT_ACTIONS)
  const [memoryError, setMemoryError] = useState('')
  const [memoryQuery, setMemoryQuery] = useState('')
  const [memoryResults, setMemoryResults] = useState<PageMemoryResult[]>([])
  const [contentEmbeddings, setContentEmbeddings] = useState<ContentEmbeddings>()
  const [indexingContent, setIndexingContent] = useState(false)
  const [indexProgress, setIndexProgress] = useState({ completed: 0, total: 0 })
  const [indexingError, setIndexingError] = useState('')
  const [indexRetry, setIndexRetry] = useState(0)
  const [requestedIndexKey, setRequestedIndexKey] = useState('')
  const [youtubeCaptionLanguage, setYoutubeCaptionLanguage] = useState('auto')
  const [pendingPdfPermissionUrl, setPendingPdfPermissionUrl] = useState<string>()
  const [embeddingModel, setEmbeddingModel] = useState('')
  const [pinnedSelection, setPinnedSelection] = useState<PinnedSelection>()
  const [selectedSources, setSelectedSources] = useState<SelectedSource[]>([])
  const [sourceCandidates, setSourceCandidates] = useState<ContentCacheItemSummary[]>([])
  const [openTabCandidates, setOpenTabCandidates] = useState<OpenTabSource[]>([])
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
  const [sourceQuery, setSourceQuery] = useState('')
  const [sourceError, setSourceError] = useState('')
  const [obsidianStatus, setObsidianStatus] = useState('')
  const [obsidianVaultFolder, setObsidianVaultFolder] = useState('PageMind')
  const chatTurnRef = useRef<PageChatTurn>()
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const contextUrlRef = useRef<string>()
  const rememberedCaptureRef = useRef<number>()
  const embeddingAttemptRef = useRef<string>()
  const embeddingCheckpointRef = useRef<EmbeddingCheckpoint>()
  const cancelIndexRef = useRef<() => void>()
  const loadRequestRef = useRef(0)
  const answerRequestRef = useRef(0)
  const pdfRequestRef = useRef<string>()

  const claimSelection = useCallback(async (tabId: number, pageUrl: string) => {
    const selection = await sendRuntimeMessage({
      type: 'CLAIM_PENDING_SELECTION',
      data: { tabId },
    })
    if (!selection || selection.url.split('#')[0] !== pageUrl.split('#')[0]) return
    setPinnedSelection(selection)
    setView('chat')
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }, [])

  const restoreSources = useCallback(async (keys?: string[]) => {
    const cachedSources = await Promise.all(
      (keys || []).slice(0, 4).map((key) => getCachedContentByKey(key)),
    )
    return cachedSources.flatMap((cached, index) =>
      cached ? [{ key: keys![index], context: cached.context, embeddings: cached.embeddings }] : [],
    )
  }, [])

  useEffect(() => {
    contextUrlRef.current = context?.url
  }, [context])

  const loadPage = useCallback(
    async (force = false, captionLanguage = youtubeCaptionLanguage) => {
      const requestId = ++loadRequestRef.current
      answerRequestRef.current += 1
      chatTurnRef.current?.cancel()
      setLoading(true)
      setAnswering(false)
      setError('')
      setPendingPdfPermissionUrl(undefined)
      setPdfProgress(undefined)
      pdfRequestRef.current = undefined
      setContext(undefined)
      setMessages([])
      setContentEmbeddings(undefined)
      setPinnedSelection(undefined)
      setSelectedSources([])
      setSourcePickerOpen(false)
      try {
        const [tab] = await Browser.tabs.query({ active: true, currentWindow: true })
        if (!tab.id) throw new Error('No active webpage was found.')
        if (pageAccessKind(tab.url) === 'restricted') {
          throw new PageMindError('CONTENT_SCRIPT_UNAVAILABLE')
        }
        setLoadStage(contentLoadStage(tab.url))
        const cached =
          !force && tab.url ? await getCachedContent(tab.url, captionLanguage) : undefined
        if (requestId !== loadRequestRef.current) return
        if (cached) {
          setContext(cached.context)
          setContentEmbeddings(cached.embeddings)
          const stored = await getConversation(cached.context.url)
          if (requestId !== loadRequestRef.current) return
          setMessages(stored?.messages || [])
          const restoredSources = await restoreSources(stored?.sourceKeys)
          if (requestId !== loadRequestRef.current) return
          setSelectedSources(restoredSources)
          await claimSelection(tab.id, cached.context.url)
          return
        }
        let page: PageContext
        if (isPdfUrl(tab.url)) {
          const pdfRequestId = crypto.randomUUID()
          pdfRequestRef.current = pdfRequestId
          page = await requestPdfContext(tab.url!, pdfRequestId)
        } else {
          try {
            page = await requestPageContext(tab.id, captionLanguage)
          } catch (contextError) {
            // Many PDFs (e.g. arXiv's /pdf/<id>) have no .pdf suffix, so we rely on the content
            // script's own PdfRedirectError signal (or its outright absence) to detect them.
            if (contextError instanceof PdfRedirectError && tab.url) {
              setLoadStage('pdf')
              const pdfRequestId = crypto.randomUUID()
              pdfRequestRef.current = pdfRequestId
              page = await requestPdfContext(tab.url, pdfRequestId)
            } else {
              throw contextError
            }
          }
        }
        if (requestId !== loadRequestRef.current) return
        if (!page?.url || !Array.isArray(page.chunks)) {
          throw new Error('The page context is not ready. Refresh the webpage and try again.')
        }
        setContext(page)
        setContentEmbeddings(undefined)
        await saveCachedContent(page, captionLanguage)
        const stored = await getConversation(page.url)
        if (requestId !== loadRequestRef.current) return
        setMessages(stored?.messages || [])
        const restoredSources = await restoreSources(stored?.sourceKeys)
        if (requestId !== loadRequestRef.current) return
        setSelectedSources(restoredSources)
        await claimSelection(tab.id, page.url)
      } catch (error: unknown) {
        if (requestId === loadRequestRef.current) {
          const code = errorCode(error, 'CONTENT_UNAVAILABLE')
          const message = userErrorMessage(error, 'CONTENT_UNAVAILABLE')
          setError(message)
          if (code === 'PDF_PERMISSION_REQUIRED') {
            const [tab] = await Browser.tabs.query({ active: true, currentWindow: true })
            if (tab.url) setPendingPdfPermissionUrl(tab.url)
          }
        }
      } finally {
        if (requestId === loadRequestRef.current) setLoading(false)
      }
    },
    [claimSelection, restoreSources, youtubeCaptionLanguage],
  )

  useEffect(() => {
    getUserConfig().then((config) => {
      const language =
        config.language === Language.Auto ? window.navigator.language : config.language
      setPageMemoryEnabled(config.pageMemoryEnabled)
      setSemanticMemoryEnabled(config.semanticMemoryEnabled)
      setAutomaticIndexingEnabled(config.automaticIndexingEnabled)
      setResponseLanguage(language)
      setPromptActions(config.promptActions)
      setYoutubeCaptionLanguage(config.youtubeCaptionLanguage)
      setObsidianVaultFolder(config.obsidianVaultFolder)
    })
    getEmbeddingConfig().then((config) => setEmbeddingModel(config.model))
  }, [])

  const embedText = useCallback(async (text: string): Promise<PageMemoryEmbedding> => {
    const result = await sendRuntimeMessage({
      type: 'GENERATE_EMBEDDINGS',
      data: { texts: [text] },
    })
    return { model: result.model, vector: result.vectors[0] }
  }, [])

  const embedTexts = useCallback(
    async (texts: string[], onProgress?: (completed: number, total: number) => void) => {
      const vectors: number[][] = []
      let model = ''
      onProgress?.(0, texts.length)
      for (const batch of embeddingBatches(texts.length)) {
        const result = await sendRuntimeMessage({
          type: 'GENERATE_EMBEDDINGS',
          data: { texts: texts.slice(batch.start, batch.end) },
        })
        model = result.model
        vectors.push(...result.vectors)
        onProgress?.(batch.end, texts.length)
      }
      return { model, vectors }
    },
    [],
  )

  useEffect(() => {
    if (context && pageMemoryEnabled && rememberedCaptureRef.current !== context.capturedAt) {
      rememberedCaptureRef.current = context.capturedAt
      const remember = async () => {
        try {
          const embedding = semanticMemoryEnabled
            ? await embedText(pageMemoryText(context))
            : undefined
          await savePageMemory(context, embedding)
          setMemoryError('')
        } catch (error: unknown) {
          await savePageMemory(context)
          setMemoryError(userErrorMessage(error, 'EMBEDDING_FAILED'))
        }
      }
      remember()
    }
  }, [context, embedText, pageMemoryEnabled, semanticMemoryEnabled])

  useEffect(() => {
    const indexKey = context ? `${context.url}:${context.capturedAt}:${embeddingModel}` : ''
    if (
      !context ||
      !semanticMemoryEnabled ||
      !embeddingModel ||
      (!automaticIndexingEnabled && requestedIndexKey !== indexKey) ||
      hasCurrentEmbeddings(context, contentEmbeddings, embeddingModel) ||
      embeddingAttemptRef.current === indexKey
    ) {
      return
    }
    let cancelled = false
    const cancel = () => {
      cancelled = true
      setIndexingContent(false)
    }
    cancelIndexRef.current = cancel
    const indexContent = async () => {
      embeddingAttemptRef.current = indexKey
      setIndexingContent(true)
      setIndexingError('')
      try {
        const embeddings = await indexContentInBatches({
          key: indexKey,
          texts: context.chunks.map((chunk) => chunk.text),
          checkpoint: embeddingCheckpointRef.current,
          embedBatch: (texts) => embedTexts(texts),
          onCheckpoint: (checkpoint) => {
            embeddingCheckpointRef.current = checkpoint
          },
          onProgress: (completed, total) => {
            if (!cancelled) setIndexProgress({ completed, total })
          },
          isCancelled: () => cancelled,
          batchSize: 64,
        })
        if (cancelled) return
        await saveContentEmbeddings(context.url, embeddings, youtubeCaptionLanguage)
        if (cancelled) return
        setContentEmbeddings(embeddings)
        embeddingCheckpointRef.current = undefined
        setIndexingError('')
      } catch (error: unknown) {
        if (!cancelled) setIndexingError(userErrorMessage(error, 'EMBEDDING_FAILED'))
      } finally {
        if (!cancelled) setIndexingContent(false)
      }
    }
    indexContent()
    return () => {
      cancel()
      if (cancelIndexRef.current === cancel) cancelIndexRef.current = undefined
    }
  }, [
    contentEmbeddings,
    context,
    embedTexts,
    embeddingModel,
    automaticIndexingEnabled,
    requestedIndexKey,
    semanticMemoryEnabled,
    youtubeCaptionLanguage,
    indexRetry,
  ])

  const retryIndexing = useCallback(() => {
    embeddingAttemptRef.current = undefined
    if (context) {
      setRequestedIndexKey(`${context.url}:${context.capturedAt}:${embeddingModel}`)
    }
    setIndexRetry((value) => value + 1)
  }, [context, embeddingModel])

  const indexCurrentContent = useCallback(() => {
    if (!context || !embeddingModel) return
    embeddingAttemptRef.current = undefined
    setRequestedIndexKey(`${context.url}:${context.capturedAt}:${embeddingModel}`)
    setIndexRetry((value) => value + 1)
  }, [context, embeddingModel])

  const cancelIndexing = useCallback(() => {
    cancelIndexRef.current?.()
    setIndexingError(t('indexingCancelled', 'Indexing was cancelled.'))
  }, [])

  const selectCaptionLanguage = useCallback(
    async (language: string) => {
      setYoutubeCaptionLanguage(language)
      embeddingAttemptRef.current = undefined
      await updateUserConfig({ youtubeCaptionLanguage: language })
      await loadPage(true, language)
    },
    [loadPage],
  )

  const grantPdfAccess = useCallback(async () => {
    if (!pendingPdfPermissionUrl) return
    try {
      await recoverPdfAccess(pendingPdfPermissionUrl, () => loadPage(true))
    } catch (error: unknown) {
      setError(userErrorMessage(error, 'PDF_PERMISSION_DENIED'))
    }
  }, [loadPage, pendingPdfPermissionUrl])

  useEffect(() => {
    loadPage()
    const onActivated = () => loadPage()
    const onUpdated = (_tabId: number, changeInfo: { status?: string; url?: string }) => {
      if (changeInfo.status === 'complete' || changeInfo.url) loadPage()
    }
    const onContextChanged = (message: unknown) => {
      if (!isRuntimeMessage(message)) return
      if (message.type === 'PAGE_CONTEXT_CHANGED') loadPage()
      if (message.type === 'SELECTION_CONTEXT_READY' && contextUrlRef.current) {
        claimSelection(message.data.tabId, contextUrlRef.current)
      }
      if (
        message.type === 'PDF_PARSE_PROGRESS' &&
        message.data.requestId === pdfRequestRef.current
      ) {
        setPdfProgress(message.data)
      }
    }
    Browser.tabs.onActivated.addListener(onActivated)
    Browser.tabs.onUpdated.addListener(onUpdated)
    Browser.runtime.onMessage.addListener(onContextChanged)
    return () => {
      Browser.tabs.onActivated.removeListener(onActivated)
      Browser.tabs.onUpdated.removeListener(onUpdated)
      Browser.runtime.onMessage.removeListener(onContextChanged)
    }
  }, [claimSelection, loadPage])

  const cancelPdfParsing = useCallback(() => {
    const requestId = pdfRequestRef.current
    if (!requestId) return
    pdfRequestRef.current = undefined
    loadRequestRef.current += 1
    sendRuntimeMessage({ type: 'CANCEL_PDF_PARSE', data: { requestId } }).catch(() => {})
    setLoading(false)
    setPdfProgress(undefined)
  }, [])

  useEffect(() => () => chatTurnRef.current?.cancel(), [])

  const send = useCallback(
    async (prompt?: string) => {
      const question = (prompt ?? input).trim()
      if (!question || !context || loading) return

      const requestId = ++answerRequestRef.current
      chatTurnRef.current?.cancel()
      const nextMessages = [...messages, createChatMessage('user', question)]
      const assistantMessage = createChatMessage('assistant', '')
      setMessages([...nextMessages, assistantMessage])
      setInput('')
      setLoading(true)
      setAnswering(true)
      setError('')

      let semanticSearch: ChunkEmbeddingSearch | undefined
      let semanticModel = ''
      let semanticQueryVector: number[] | undefined
      const hasSemanticSource =
        contentEmbeddings?.vectors.length === context.chunks.length ||
        selectedSources.some(
          (source) => source.embeddings?.vectors.length === source.context.chunks.length,
        )
      if (semanticMemoryEnabled && hasSemanticSource) {
        try {
          const queryEmbedding = await embedText(question)
          semanticModel = queryEmbedding.model
          semanticQueryVector = queryEmbedding.vector
          if (
            queryEmbedding.model === contentEmbeddings?.model &&
            contentEmbeddings.vectors.length === context.chunks.length
          ) {
            semanticSearch = {
              chunkVectors: contentEmbeddings.vectors,
              queryVector: queryEmbedding.vector,
            }
          }
        } catch {
          // Keyword retrieval remains available when semantic search is unavailable.
        }
      }

      if (requestId !== answerRequestRef.current) return

      const providerPrompt = selectedSources.length
        ? multiPageContextToPrompt(
            [context, ...selectedSources.map((source) => source.context)],
            nextMessages,
            responseLanguage,
            pinnedSelection?.text,
            [
              semanticSearch,
              ...selectedSources.map((source) =>
                semanticMemoryEnabled &&
                source.embeddings?.model === semanticModel &&
                source.embeddings.vectors.length === source.context.chunks.length &&
                semanticQueryVector
                  ? {
                      chunkVectors: source.embeddings.vectors,
                      queryVector: semanticQueryVector,
                    }
                  : undefined,
              ),
            ],
          )
        : pageContextToPrompt(
            context,
            nextMessages,
            responseLanguage,
            semanticSearch,
            pinnedSelection?.text,
          )
      chatTurnRef.current = startPageChatTurn(providerPrompt, {
        onText(answerText) {
          if (requestId !== answerRequestRef.current) return
          setMessages([...nextMessages, { ...assistantMessage, content: answerText }])
        },
        onError(providerError) {
          if (requestId !== answerRequestRef.current) return
          setError(userErrorMessage(providerError, 'CHAT_REQUEST_FAILED'))
          setLoading(false)
          setAnswering(false)
        },
        onDone(answerText) {
          if (requestId !== answerRequestRef.current) return
          setLoading(false)
          setAnswering(false)
          if (!answerText) return
          saveConversation({
            url: context.url,
            title: context.title,
            messages: [...nextMessages, { ...assistantMessage, content: answerText }],
            sourceKeys: selectedSources.map((source) => source.key),
            updatedAt: Date.now(),
          }).catch(() => {})
        },
        onDisconnect() {
          if (requestId !== answerRequestRef.current) return
          setLoading(false)
          setAnswering(false)
        },
      })
    },
    [
      contentEmbeddings,
      context,
      embedText,
      input,
      loading,
      messages,
      pinnedSelection,
      responseLanguage,
      selectedSources,
      semanticMemoryEnabled,
    ],
  )

  const cancelAnswer = useCallback(() => {
    answerRequestRef.current += 1
    chatTurnRef.current?.cancel()
    chatTurnRef.current = undefined
    setLoading(false)
    setAnswering(false)
  }, [])

  const clearConversation = useCallback(async () => {
    if (!context) return
    answerRequestRef.current += 1
    chatTurnRef.current?.cancel()
    await deleteConversation(context.url)
    setMessages([])
    setError('')
    setLoading(false)
    setAnswering(false)
  }, [context])

  const downloadMarkdown = useCallback(() => {
    if (!context || messages.length === 0) return
    const exported = selectedSources.length
      ? createMultiSourceConversationMarkdown(
          [context, ...selectedSources.map((source) => source.context)],
          messages,
        )
      : createConversationMarkdown(context, messages)
    const url = URL.createObjectURL(
      new Blob([exported.content], { type: 'text/markdown;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = exported.filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [context, messages, selectedSources])

  const saveToObsidian = useCallback(async () => {
    if (!context || messages.length === 0) return
    const exported = selectedSources.length
      ? createMultiSourceConversationMarkdown(
          [context, ...selectedSources.map((source) => source.context)],
          messages,
        )
      : createConversationMarkdown(context, messages)
    setObsidianStatus(t('obsidianSaving', 'Saving to Obsidian…'))
    try {
      const vault = await saveMarkdownToObsidianVault(
        exported.filename,
        exported.content,
        obsidianVaultFolder,
      )
      setObsidianStatus(t('obsidianSaved', `Saved to ${vault}`, [vault]))
    } catch (saveError: unknown) {
      if (saveError instanceof DOMException && saveError.name === 'AbortError') {
        setObsidianStatus('')
        return
      }
      setObsidianStatus(
        saveError instanceof Error && saveError.message === 'FILE_SYSTEM_ACCESS_UNAVAILABLE'
          ? t('obsidianUnsupported', 'Direct Vault saving is not supported in this browser.')
          : t('obsidianSaveFailed', 'Could not save the note to your Vault.'),
      )
    }
  }, [context, messages, obsidianVaultFolder, selectedSources])

  const scrollToCitation = useCallback(
    async (chunkId: string) => {
      const multiSource = chunkId.match(/^source-(\d+):(.+)$/)
      if (multiSource && Number(multiSource[1]) > 1) {
        const source = selectedSources[Number(multiSource[1]) - 2]?.context
        const chunk = source?.chunks.find((candidate) => candidate.id === multiSource[2])
        if (!source || !chunk) return
        let url = source.url
        if (chunk.location.type === 'youtube') {
          url = `https://www.youtube.com/watch?v=${encodeURIComponent(chunk.location.videoId)}&t=${
            chunk.location.seconds
          }s`
        } else if (chunk.location.type === 'pdf') {
          url = `${source.url.split('#')[0]}#page=${chunk.location.page}`
        }
        await Browser.tabs.create({ url })
        return
      }
      const currentChunkId = multiSource?.[2] || chunkId
      const [tab] = await Browser.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) return
      if (context && context.sourceType === 'pdf') {
        const page = currentChunkId.match(/^pdf-page-(\d+)$/)?.[1]
        if (!page) return
        const baseUrl = context.url.split('#')[0]
        await Browser.tabs.update(tab.id, { url: `${baseUrl}#page=${page}` })
        return
      }
      const response = await sendTabMessage(tab.id, {
        type: 'SCROLL_TO_PAGE_CHUNK',
        data: { chunkId: currentChunkId },
      })
      if (!response?.found) setError(userErrorMessage('', 'CITATION_MISSING'))
    },
    [context, selectedSources],
  )

  const toggleSourcePicker = useCallback(async () => {
    if (sourcePickerOpen) {
      setSourcePickerOpen(false)
      return
    }
    const [cached, tabs] = await Promise.all([
      listCachedContent(),
      Browser.tabs.query({ currentWindow: true }),
    ])
    setSourceCandidates(cached)
    setOpenTabCandidates(
      tabs.flatMap((tab) =>
        tab.id && tab.url && pageAccessKind(tab.url) !== 'restricted' && tab.url !== context?.url
          ? [{ id: tab.id, url: tab.url, title: tab.title || tab.url }]
          : [],
      ),
    )
    setSourceError('')
    setSourcePickerOpen(true)
  }, [context?.url, sourcePickerOpen])

  const addSource = useCallback(
    async (candidate: ContentCacheItemSummary) => {
      if (selectedSources.some((source) => source.key === candidate.key)) {
        setSelectedSources((sources) => sources.filter((source) => source.key !== candidate.key))
        return
      }
      if (selectedSources.length >= 4) return
      const cached = await getCachedContentByKey(candidate.key)
      if (!cached) return
      setSelectedSources((sources) => [
        ...sources,
        { key: candidate.key, context: cached.context, embeddings: cached.embeddings },
      ])
    },
    [selectedSources],
  )

  const addOpenTab = useCallback(
    async (tab: OpenTabSource) => {
      if (selectedSources.length >= 4) return
      setSourceError('')
      try {
        let cached = await getCachedContent(tab.url, youtubeCaptionLanguage)
        if (!cached) {
          if (isPdfUrl(tab.url)) {
            throw new Error(
              t(
                'inactivePdfSource',
                'Open this PDF as the current tab and read it once before adding it.',
              ),
            )
          }
          const page = await requestPageContext(tab.id, youtubeCaptionLanguage)
          if (!page.chunks.length) throw new Error('CONTENT_UNAVAILABLE')
          await saveCachedContent(page, youtubeCaptionLanguage)
          cached = await getCachedContent(tab.url, youtubeCaptionLanguage)
        }
        if (!cached) throw new Error('CONTENT_UNAVAILABLE')
        setSelectedSources((sources) => [
          ...sources,
          { key: cached!.key, context: cached!.context, embeddings: cached!.embeddings },
        ])
        setSourceCandidates(await listCachedContent())
      } catch (error: unknown) {
        setSourceError(userErrorMessage(error, 'CONTENT_UNAVAILABLE'))
      }
    },
    [selectedSources.length, youtubeCaptionLanguage],
  )

  const searchMemory = useCallback(
    async (query = memoryQuery) => {
      setMemoryQuery(query)
      setMemoryError('')
      try {
        const embedding =
          semanticMemoryEnabled && query.trim() ? await embedText(query.trim()) : undefined
        setMemoryResults(
          await searchPageMemories(query, {
            queryVector: embedding?.vector,
            embeddingModel: embedding?.model,
          }),
        )
      } catch (error: unknown) {
        setMemoryError(userErrorMessage(error, 'EMBEDDING_FAILED'))
        setMemoryResults(await searchPageMemories(query))
      }
    },
    [embedText, memoryQuery, semanticMemoryEnabled],
  )

  const openMemory = useCallback(async () => {
    setView('memory')
    if (pageMemoryEnabled) await searchMemory('')
  }, [pageMemoryEnabled, searchMemory])

  const enableMemory = useCallback(async () => {
    await updateUserConfig({ pageMemoryEnabled: true })
    if (context) {
      rememberedCaptureRef.current = context.capturedAt
      await savePageMemory(context)
    }
    setPageMemoryEnabled(true)
    await searchMemory('')
  }, [context, searchMemory])

  const pauseMemory = useCallback(async () => {
    await updateUserConfig({ pageMemoryEnabled: false })
    setPageMemoryEnabled(false)
  }, [])

  const enableSemanticMemory = useCallback(async () => {
    if (!context) return
    setMemoryError('')
    try {
      const embedding = await embedText(pageMemoryText(context))
      await savePageMemory(context, embedding)
      await updateUserConfig({ semanticMemoryEnabled: true })
      setSemanticMemoryEnabled(true)
      await searchMemory(memoryQuery)
    } catch (error: unknown) {
      setMemoryError(userErrorMessage(error, 'EMBEDDING_FAILED'))
    }
  }, [context, embedText, memoryQuery, searchMemory])

  const normalizedSourceQuery = sourceQuery.trim().toLocaleLowerCase()
  const matchingCachedSources = sourceCandidates.filter(
    (candidate) =>
      candidate.url !== context?.url &&
      (!normalizedSourceQuery ||
        `${candidate.title} ${candidate.url}`.toLocaleLowerCase().includes(normalizedSourceQuery)),
  )
  const matchingOpenTabs = openTabCandidates.filter(
    (tab) =>
      !sourceCandidates.some((candidate) => candidate.url === tab.url) &&
      (!normalizedSourceQuery ||
        `${tab.title} ${tab.url}`.toLocaleLowerCase().includes(normalizedSourceQuery)),
  )

  return (
    <main className="panel">
      <header className="panel__header">
        <div>
          <strong>PageMind</strong>
          <span>
            {context?.sourceType === 'youtube' ? 'YouTube · ' : ''}
            {context?.sourceType === 'pdf' ? 'PDF · ' : ''}
            {context?.title || t('currentPage', 'Current page')}
          </span>
        </div>
        <div className="panel__actions">
          {messages.length > 0 && <button onClick={downloadMarkdown}>Markdown</button>}
          {messages.length > 0 && (
            <button onClick={saveToObsidian}>{t('saveToObsidian', 'Save to Obsidian')}</button>
          )}
          {messages.length > 0 && (
            <button onClick={clearConversation}>{t('clear', 'Clear')}</button>
          )}
          <button onClick={() => Browser.runtime.openOptionsPage()}>
            {t('settings', 'Settings')}
          </button>
          <button onClick={() => loadPage(true)} disabled={loading}>
            {t('refresh', 'Refresh')}
          </button>
        </div>
      </header>

      {obsidianStatus && <p className="panel__notice">{obsidianStatus}</p>}

      <nav className="panel__nav">
        <button className={view === 'chat' ? 'is-active' : ''} onClick={() => setView('chat')}>
          {t('currentPage', 'Current page')}
        </button>
        <button className={view === 'memory' ? 'is-active' : ''} onClick={openMemory}>
          {t('pageMemory', 'Page memory')}
        </button>
      </nav>

      <section className={`panel__sources ${view !== 'chat' ? 'is-hidden' : ''}`}>
        <div className="panel__source-row">
          <button onClick={toggleSourcePicker} disabled={!context}>
            {t('addSources', '+ Sources')}
          </button>
          <span>{t('sourceCount', '$1 sources selected', String(1 + selectedSources.length))}</span>
          {selectedSources.map((source) => (
            <button
              key={source.key}
              className="source-chip"
              onClick={() =>
                setSelectedSources((sources) =>
                  sources.filter((candidate) => candidate.key !== source.key),
                )
              }
              title={source.context.title}
            >
              {source.context.title} ×
            </button>
          ))}
        </div>
        {sourcePickerOpen && (
          <div className="source-picker">
            <input
              value={sourceQuery}
              onInput={(event) => setSourceQuery(event.currentTarget.value)}
              placeholder={t('filterSources', 'Filter sources…')}
              autoFocus
            />
            <strong>{t('chooseCachedSources', 'Choose saved sources')}</strong>
            {matchingCachedSources.map((candidate) => {
              const selected = selectedSources.some((source) => source.key === candidate.key)
              return (
                <button
                  key={candidate.key}
                  className={selected ? 'is-selected' : ''}
                  onClick={() => addSource(candidate)}
                  disabled={!selected && selectedSources.length >= 4}
                >
                  <span>{candidate.title || candidate.url}</span>
                  <small>
                    {candidate.sourceType} · {candidate.chunks} {t('chunks', 'chunks')}
                  </small>
                </button>
              )
            })}
            {matchingOpenTabs.length > 0 && (
              <strong>{t('openTabs', 'Open tabs · read when selected')}</strong>
            )}
            {matchingOpenTabs.map((tab) => (
              <button
                key={`tab-${tab.id}`}
                onClick={() => addOpenTab(tab)}
                disabled={selectedSources.length >= 4 || isPdfUrl(tab.url)}
                title={
                  isPdfUrl(tab.url)
                    ? t(
                        'inactivePdfSource',
                        'Open this PDF as the current tab and read it once before adding it.',
                      )
                    : tab.url
                }
              >
                <span>{tab.title}</span>
                <small>
                  {isPdfUrl(tab.url)
                    ? t('readPdfFirst', 'Read this PDF first')
                    : t('readOpenTab', 'Read and add open tab')}
                </small>
              </button>
            ))}
            {sourceError && <p className="source-picker__error">{sourceError}</p>}
            {matchingCachedSources.length === 0 && matchingOpenTabs.length === 0 && (
              <p>{t('noAdditionalSources', 'No matching saved sources or open tabs.')}</p>
            )}
          </div>
        )}
      </section>

      {view === 'chat' ? (
        <section className="panel__messages">
          {loading && !answering && (
            <div className="panel__notice">
              <span>
                {loadStage === 'pdf'
                  ? pdfProgress?.stage === 'parsing' && pdfProgress.total
                    ? t('pdfParsingProgress', 'Reading PDF pages… $1 / $2', [
                        String(pdfProgress.completed),
                        String(pdfProgress.total),
                      ])
                    : pdfProgress?.stage === 'finishing'
                    ? t('pdfFinishing', 'Preparing extracted PDF text…')
                    : t('readingPdf', 'Downloading and reading PDF…')
                  : loadStage === 'youtube'
                  ? t('readingYoutube', 'Finding and reading captions…')
                  : t('readingPage', 'Reading page content…')}
              </span>{' '}
              {loadStage === 'pdf' && (
                <button onClick={cancelPdfParsing}>{t('cancel', 'Cancel')}</button>
              )}
            </div>
          )}
          {context?.sourceType === 'youtube' && (context.captions?.length || 0) > 1 && (
            <label className="caption-language">
              <span>{t('transcriptLanguage', 'Transcript language')}</span>
              <select
                value={youtubeCaptionLanguage}
                onChange={(event) => selectCaptionLanguage(event.currentTarget.value)}
                disabled={loading}
              >
                <option value="auto">{t('automatic', 'Automatic')}</option>
                {context.captions
                  ?.filter(
                    (caption, index, captions) =>
                      caption.languageCode &&
                      captions.findIndex((item) => item.languageCode === caption.languageCode) ===
                        index,
                  )
                  .map((caption) => (
                    <option key={caption.languageCode} value={caption.languageCode}>
                      {caption.label}
                      {caption.automatic ? ` · ${t('autoGenerated', 'auto-generated')}` : ''}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {messages.length === 0 && !error && (
            <div className="panel__empty">
              {context?.sourceType === 'youtube' && context.chunks.length === 0 ? (
                <>
                  <h1>
                    {context.extraction.error?.code === 'YOUTUBE_TRANSCRIPT_EXTRACTION_FAILED'
                      ? t('captionsReadFailedTitle', 'Could not read captions')
                      : t('captionsUnavailableTitle', 'No captions found')}
                  </h1>
                  <p>
                    {context.extraction.error?.code === 'YOUTUBE_TRANSCRIPT_EXTRACTION_FAILED'
                      ? t(
                          'captionsReadFailedDescription',
                          'Captions are listed for this video, but PageMind could not extract them.',
                        )
                      : t(
                          'captionsUnavailableDescription',
                          'This video has no accessible captions.',
                        )}
                  </p>
                </>
              ) : context?.sourceType === 'pdf' && context.chunks.length === 0 ? (
                <>
                  <h1>{t('pdfNoTextTitle', 'No text found')}</h1>
                  <p>
                    {t(
                      'pdfNoTextDescription',
                      'This PDF has no extractable text and may require OCR.',
                    )}
                  </p>
                </>
              ) : (
                <>
                  <h1>
                    {context?.sourceType === 'youtube'
                      ? t('chatWithVideo', 'Chat with this video')
                      : context?.sourceType === 'pdf'
                      ? t('chatWithDocument', 'Chat with this document')
                      : t('chatWithPage', 'Chat with this page')}
                  </h1>
                  <p>
                    {t(
                      'chatEmptyDescription',
                      'Ask a question or start with one of your prompt actions.',
                    )}
                  </p>
                  <div className="prompt-actions">
                    {promptActions.map((action) => (
                      <button key={action.id} onClick={() => send(action.prompt)}>
                        {action.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {indexingContent && (
            <div className="panel__notice">
              <span>
                {indexProgress.total
                  ? t('indexingProgress', 'Indexing for semantic search… $1 / $2', [
                      String(indexProgress.completed),
                      String(indexProgress.total),
                    ])
                  : t('indexingContent', 'Indexing this content for semantic search…')}
              </span>{' '}
              <button onClick={cancelIndexing}>{t('cancel', 'Cancel')}</button>
            </div>
          )}
          {context &&
            semanticMemoryEnabled &&
            !automaticIndexingEnabled &&
            !indexingContent &&
            !hasCurrentEmbeddings(context, contentEmbeddings, embeddingModel) && (
              <div className="panel__notice">
                <span>
                  {t(
                    'manualIndexingDescription',
                    'Create embeddings only when you choose. This may use a paid embedding API.',
                  )}
                </span>{' '}
                <button onClick={indexCurrentContent}>
                  {t(
                    'indexContentButton',
                    'Index this content ($1 chunks)',
                    String(context.chunks.length),
                  )}
                </button>
              </div>
            )}
          {indexingError && (
            <div className="panel__error">
              <span>{indexingError}</span>{' '}
              <button onClick={retryIndexing}>{t('retry', 'Retry')}</button>
            </div>
          )}
          {messages.length > 0 && promptActions.length > 0 && (
            <div className="prompt-actions prompt-actions--compact">
              {promptActions.map((action) => (
                <button key={action.id} onClick={() => send(action.prompt)} disabled={loading}>
                  {action.label}
                </button>
              ))}
            </div>
          )}
          {messages.map((message) => (
            <article key={message.id} className={`message message--${message.role}`}>
              <span>{message.role === 'user' ? t('you', 'You') : 'AI'}</span>
              {message.content ? (
                <ReactMarkdown
                  components={{
                    a: ({ href, children }) => {
                      const citation = href?.match(
                        /^#pagemind-((?:source-\d+:)?(?:pdf-page-\d+|page-\d+|yt-(?:\d+:)?\d{1,2}:\d{2}))$/,
                      )?.[1]
                      if (citation) {
                        return (
                          <a
                            href={href}
                            className="message__citation"
                            onClick={(event) => {
                              event.preventDefault()
                              scrollToCitation(citation)
                            }}
                          >
                            {children}
                          </a>
                        )
                      }
                      const externalUrl = safeExternalUrl(href)
                      if (!externalUrl) return <span>{children}</span>
                      return (
                        <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      )
                    },
                  }}
                >
                  {linkifyChunkCitations(message.content)}
                </ReactMarkdown>
              ) : (
                <p>{t('thinking', 'Thinking…')}</p>
              )}
            </article>
          ))}
          {error && <p className="panel__error">{error}</p>}
          {pendingPdfPermissionUrl && (
            <button className="panel__permission" onClick={grantPdfAccess}>
              {t('allowPdfAccess', 'Allow access and read PDF')}
            </button>
          )}
          {context?.sourceType === 'pdf' && context.extraction?.truncated && (
            <p className="panel__notice">
              {t(
                'pdfTruncated',
                'This document exceeded the local extraction limit. Search covers the extracted pages only.',
              )}
            </p>
          )}
        </section>
      ) : (
        <section className="memory">
          {!pageMemoryEnabled ? (
            <div className="memory__opt-in">
              <h1>{t('memoryTitle', 'Find pages you read before')}</h1>
              <p>
                {t(
                  'memoryDescription',
                  'Save lightweight page cards on this device. Page content is not synced to a cloud service.',
                )}
              </p>
              <button onClick={enableMemory}>
                {t('enableMemory', 'Enable local page memory')}
              </button>
            </div>
          ) : (
            <>
              <form
                className="memory__search"
                onSubmit={(event) => {
                  event.preventDefault()
                  searchMemory()
                }}
              >
                <input
                  value={memoryQuery}
                  onInput={(event) => setMemoryQuery(event.currentTarget.value)}
                  placeholder={t('memoryPlaceholder', 'What do you remember about the page?')}
                />
                <button type="submit">{t('search', 'Search')}</button>
              </form>
              <div className="memory__meta">
                <span>{t('resultCount', '$1 results', String(memoryResults.length))}</span>
                <button onClick={pauseMemory}>{t('pauseRecording', 'Pause recording')}</button>
              </div>
              {!semanticMemoryEnabled ? (
                <div className="memory__semantic">
                  <div>
                    <strong>{t('semanticOff', 'Semantic search is off')}</strong>
                    <span>
                      {t(
                        'semanticDisclosure',
                        'Enabling it sends compact page cards and search queries to your configured embedding API.',
                      )}
                    </span>
                  </div>
                  <button onClick={enableSemanticMemory}>{t('enable', 'Enable')}</button>
                </div>
              ) : (
                <p className="memory__semantic-status">
                  {t('semanticEnabled', 'Semantic + keyword search enabled')}
                </p>
              )}
              {memoryError && <p className="panel__error">{memoryError}</p>}
              <div className="memory__results">
                {memoryResults.map((memory) => (
                  <button
                    key={memory.url}
                    className="memory-card"
                    onClick={() => {
                      const url = safeExternalUrl(memory.url)
                      if (url) Browser.tabs.create({ url })
                    }}
                  >
                    <strong>{memory.title || memory.domain}</strong>
                    <span>
                      {memory.domain} · {new Date(memory.lastVisitedAt).toLocaleDateString()}
                    </span>
                    <p>{memory.description || memory.excerpts[0]}</p>
                  </button>
                ))}
                {memoryResults.length === 0 && (
                  <p className="memory__empty">{t('noMemoryResults', 'No matching pages yet.')}</p>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {view === 'chat' && (
        <footer className="panel__composer">
          {pinnedSelection && (
            <div className="panel__pinned">
              <div>
                <strong>{t('pinnedSelection', 'Pinned selection')}</strong>
                <span>{pinnedSelection.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setPinnedSelection(undefined)}
                aria-label={t('removePinnedSelection', 'Remove pinned selection')}
              >
                ×
              </button>
            </div>
          )}
          <textarea
            ref={composerRef}
            value={input}
            onInput={(event) => setInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            placeholder={t('askPlaceholder', 'Ask about this page…')}
            disabled={!context || context.chunks.length === 0}
          />
          {answering ? (
            <button onClick={cancelAnswer}>{t('stop', 'Stop')}</button>
          ) : (
            <button
              onClick={() => send()}
              disabled={!input.trim() || !context || context.chunks.length === 0 || loading}
            >
              {t('send', 'Send')}
            </button>
          )}
        </footer>
      )}
    </main>
  )
}
