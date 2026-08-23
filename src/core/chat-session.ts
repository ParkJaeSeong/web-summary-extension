import { ChatMessage } from './page-context'

export interface PinnedSelection {
  text: string
  url: string
  title?: string
  createdAt: number
}

export function createChatMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content }
}

export function normalizePinnedSelection(selection: PinnedSelection): PinnedSelection {
  return {
    ...selection,
    text: selection.text.replace(/\s+/g, ' ').trim().slice(0, 6000),
  }
}
