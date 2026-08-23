import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdleLifecycle } from './idle-lifecycle'

describe('offscreen idle lifecycle', () => {
  afterEach(() => vi.useRealTimers())

  it('notifies only after the full idle period', async () => {
    vi.useFakeTimers()
    const onIdle = vi.fn()
    const lifecycle = new IdleLifecycle(60_000, onIdle)

    lifecycle.idle()
    await vi.advanceTimersByTimeAsync(30_000)
    lifecycle.active()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onIdle).not.toHaveBeenCalled()

    lifecycle.idle()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onIdle).toHaveBeenCalledOnce()
  })
})
