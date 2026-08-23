import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSSE } from './fetch-sse'

describe('provider SSE errors', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('classifies a paid subscription requirement without exposing the response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'paid_subscription_required',
              type: 'permission_error',
              message: 'private provider detail',
            },
          }),
          { status: 403 },
        ),
      ),
    )

    await expect(fetchSSE('https://provider.test/chat', { onMessage: vi.fn() })).rejects.toThrow(
      'PROVIDER_SUBSCRIPTION_REQUIRED',
    )
  })
})
