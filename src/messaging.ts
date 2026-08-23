import { PageContext } from '@/core/page-context'
import { PinnedSelection } from '@/core/chat-session'
import type { StoredConversation } from '@/storage/conversations'
import Browser from 'webextension-polyfill'

export interface Answer {
  text: string
  messageId: string
  conversationId: string
}

export interface EmbeddingResponse {
  model: string
  vectors: number[][]
}

export interface ParsedPdfResponse {
  pages: Array<{ page: number; text: string }>
  title?: string
  processedPages: number
  totalPages: number
  truncated: boolean
}

export interface MessageError {
  error: string
}

export interface PdfParseProgress {
  requestId: string
  stage: 'downloading' | 'parsing' | 'finishing'
  completed: number
  total: number
}

export interface OffscreenStatus {
  activeJobs: number
}

export interface RuntimeProtocol {
  OPEN_OPTIONS_PAGE: { request: Record<never, never>; response: void }
  GENERATE_EMBEDDINGS: {
    request: { data: { texts: string[] } }
    response: EmbeddingResponse
  }
  GET_PDF_CONTEXT: {
    request: { data: { url: string; requestId: string } }
    response: PageContext | MessageError
  }
  PARSE_PDF: {
    request: { data: { url: string; requestId: string } }
    response: ParsedPdfResponse | MessageError
  }
  PDF_PARSE_PROGRESS: { request: { data: PdfParseProgress }; response: void }
  CANCEL_PDF_PARSE: { request: { data: { requestId: string } }; response: boolean }
  PING_OFFSCREEN: { request: Record<never, never>; response: boolean }
  GET_OFFSCREEN_STATUS: { request: Record<never, never>; response: OffscreenStatus }
  OFFSCREEN_IDLE: { request: Record<never, never>; response: boolean }
  OPEN_SIDE_PANEL: { request: Record<never, never>; response: boolean }
  OPEN_SELECTION_IN_SIDE_PANEL: {
    request: { data: { selection: PinnedSelection } }
    response: boolean
  }
  CLAIM_PENDING_SELECTION: {
    request: { data: { tabId: number } }
    response: PinnedSelection | undefined
  }
  SELECTION_CONTEXT_READY: { request: { data: { tabId: number } }; response: void }
  GET_CONVERSATION: {
    request: { data: { url: string } }
    response: StoredConversation | undefined
  }
  SAVE_CONVERSATION: {
    request: { data: { conversation: StoredConversation } }
    response: void
  }
  PAGE_CONTEXT_CHANGED: { request: { url: string }; response: void }
}

export interface TabProtocol {
  GET_PAGE_CONTEXT: {
    request: { data: { captionLanguage?: string } }
    response: PageContext | { isPdfDocument: true }
  }
  SCROLL_TO_PAGE_CHUNK: {
    request: { data: { chunkId: string } }
    response: { found: boolean }
  }
  GET_SELECTED_TEXT: {
    request: Record<never, never>
    response: { text: string }
  }
}

type ProtocolMessage<Protocol, Type extends keyof Protocol> = {
  type: Type
} & (Protocol[Type] extends { request: infer Request } ? Request : never)

export type RuntimeMessage = {
  [Type in keyof RuntimeProtocol]: ProtocolMessage<RuntimeProtocol, Type>
}[keyof RuntimeProtocol]

export type TabMessage = {
  [Type in keyof TabProtocol]: ProtocolMessage<TabProtocol, Type>
}[keyof TabProtocol]

export function isRuntimeMessage(message: unknown): message is RuntimeMessage {
  if (!message || typeof message !== 'object' || !('type' in message)) return false
  return [
    'OPEN_OPTIONS_PAGE',
    'GENERATE_EMBEDDINGS',
    'GET_PDF_CONTEXT',
    'PARSE_PDF',
    'PDF_PARSE_PROGRESS',
    'CANCEL_PDF_PARSE',
    'PING_OFFSCREEN',
    'GET_OFFSCREEN_STATUS',
    'OFFSCREEN_IDLE',
    'OPEN_SIDE_PANEL',
    'OPEN_SELECTION_IN_SIDE_PANEL',
    'CLAIM_PENDING_SELECTION',
    'SELECTION_CONTEXT_READY',
    'GET_CONVERSATION',
    'SAVE_CONVERSATION',
    'PAGE_CONTEXT_CHANGED',
  ].includes(String(message.type))
}

export function isTabMessage(message: unknown): message is TabMessage {
  if (!message || typeof message !== 'object' || !('type' in message)) return false
  return ['GET_PAGE_CONTEXT', 'SCROLL_TO_PAGE_CHUNK', 'GET_SELECTED_TEXT'].includes(
    String(message.type),
  )
}

export async function sendRuntimeMessage<Type extends keyof RuntimeProtocol>(
  message: ProtocolMessage<RuntimeProtocol, Type>,
) {
  return (await Browser.runtime.sendMessage(message)) as RuntimeProtocol[Type]['response']
}

export async function sendTabMessage<Type extends keyof TabProtocol>(
  tabId: number,
  message: ProtocolMessage<TabProtocol, Type>,
) {
  return (await Browser.tabs.sendMessage(tabId, message)) as TabProtocol[Type]['response']
}

export const PAGE_CHAT_PORT = 'page-chat'

export interface PageChatRequest {
  question: string
}

export type PageChatEvent =
  | { text: string; messageId?: string; conversationId?: string }
  | { error: string }
  | { event: 'DONE' }

export function isPageChatRequest(message: unknown): message is PageChatRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    'question' in message &&
    typeof message.question === 'string'
  )
}
