import { PAGE_CHAT_PORT, PageChatEvent } from '@/messaging'
import Browser from 'webextension-polyfill'

interface PortEvent<T> {
  addListener(listener: (value: T) => void): void
  removeListener?(listener: (value: T) => void): void
}

export interface PageChatPort {
  onMessage: PortEvent<PageChatEvent>
  onDisconnect: PortEvent<void>
  postMessage(message: { question: string }): void
  disconnect(): void
}

export interface PageChatCallbacks {
  onText(text: string): void
  onDone(text: string): void
  onError(error: string): void
  onDisconnect(): void
}

export interface PageChatTurn {
  cancel(): void
}

export function startPageChatTurn(
  question: string,
  callbacks: PageChatCallbacks,
  connect: () => PageChatPort = () =>
    Browser.runtime.connect({ name: PAGE_CHAT_PORT }) as unknown as PageChatPort,
): PageChatTurn {
  let port: PageChatPort
  try {
    port = connect()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'CHAT_REQUEST_FAILED'
    queueMicrotask(() => callbacks.onError(message))
    return { cancel() {} }
  }
  let answer = ''
  let settled = false

  const cleanup = () => {
    port.onMessage.removeListener?.(onMessage)
    port.onDisconnect.removeListener?.(onDisconnect)
  }
  const onMessage = (event: PageChatEvent) => {
    if (settled) return
    if ('text' in event) {
      answer = event.text
      callbacks.onText(answer)
      return
    }
    if ('error' in event) {
      settled = true
      cleanup()
      callbacks.onError(event.error)
      port.disconnect()
      return
    }
    if (event.event === 'DONE') {
      settled = true
      cleanup()
      callbacks.onDone(answer)
    }
  }
  const onDisconnect = () => {
    if (settled) return
    settled = true
    cleanup()
    callbacks.onDisconnect()
  }

  port.onMessage.addListener(onMessage)
  port.onDisconnect.addListener(onDisconnect)
  port.postMessage({ question })

  return {
    cancel() {
      if (settled) return
      settled = true
      cleanup()
      port.disconnect()
    },
  }
}
