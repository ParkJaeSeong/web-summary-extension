import { describe, expect, it, vi } from 'vitest'
import { PageChatEvent } from '@/messaging'
import { PageChatPort, startPageChatTurn } from './page-chat-session'

function fakePort() {
  const messageListeners = new Set<(event: PageChatEvent) => void>()
  const disconnectListeners = new Set<() => void>()
  const port: PageChatPort = {
    onMessage: {
      addListener: (listener) => messageListeners.add(listener),
      removeListener: (listener) => messageListeners.delete(listener),
    },
    onDisconnect: {
      addListener: (listener) => disconnectListeners.add(listener),
      removeListener: (listener) => disconnectListeners.delete(listener),
    },
    postMessage: vi.fn(),
    disconnect: vi.fn(() => disconnectListeners.forEach((listener) => listener())),
  }
  return {
    port,
    emit: (event: PageChatEvent) => messageListeners.forEach((listener) => listener(event)),
    disconnect: () => disconnectListeners.forEach((listener) => listener()),
  }
}

describe('page chat session', () => {
  it('reports a synchronously invalidated extension context without throwing', async () => {
    const callbacks = {
      onText: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onDisconnect: vi.fn(),
    }

    expect(() =>
      startPageChatTurn('prompt', callbacks, () => {
        throw new Error('Extension context invalidated.')
      }),
    ).not.toThrow()

    await Promise.resolve()
    expect(callbacks.onError).toHaveBeenCalledWith('Extension context invalidated.')
  })

  it('streams accumulated text and completes with the final answer', () => {
    const transport = fakePort()
    const callbacks = {
      onText: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onDisconnect: vi.fn(),
    }

    startPageChatTurn('prompt', callbacks, () => transport.port)
    transport.emit({ text: 'A' })
    transport.emit({ text: 'Answer' })
    transport.emit({ event: 'DONE' })

    expect(transport.port.postMessage).toHaveBeenCalledWith({ question: 'prompt' })
    expect(callbacks.onText).toHaveBeenLastCalledWith('Answer')
    expect(callbacks.onDone).toHaveBeenCalledWith('Answer')
    expect(callbacks.onDisconnect).not.toHaveBeenCalled()
  })

  it('cancels silently and reports unexpected disconnects', () => {
    const cancelled = fakePort()
    const cancelledCallbacks = {
      onText: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onDisconnect: vi.fn(),
    }
    const turn = startPageChatTurn('prompt', cancelledCallbacks, () => cancelled.port)
    turn.cancel()
    expect(cancelled.port.disconnect).toHaveBeenCalled()
    expect(cancelledCallbacks.onDisconnect).not.toHaveBeenCalled()

    const interrupted = fakePort()
    const interruptedCallbacks = { ...cancelledCallbacks, onDisconnect: vi.fn() }
    startPageChatTurn('prompt', interruptedCallbacks, () => interrupted.port)
    interrupted.disconnect()
    expect(interruptedCallbacks.onDisconnect).toHaveBeenCalledOnce()
  })
})
