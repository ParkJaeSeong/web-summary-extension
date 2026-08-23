import { createParser } from 'eventsource-parser'
import { streamAsyncIterable } from './stream-async-iterable.js'

async function stableProviderError(response: Response) {
  try {
    const body = await response.json()
    const code = body?.error?.code || body?.code
    if (code === 'paid_subscription_required' || code === 'insufficient_credits') {
      return 'PROVIDER_SUBSCRIPTION_REQUIRED'
    }
  } catch {
    // Provider error bodies are optional and never exposed to the UI.
  }
}

export async function fetchSSE(
  resource: string,
  options: RequestInit & { onMessage: (message: string) => void },
) {
  const { onMessage, ...fetchOptions } = options
  const resp = await fetch(resource, fetchOptions)
  if (!resp.ok) {
    // Do not surface provider response bodies: they may echo request content or credentials.
    const stableError = await stableProviderError(resp)
    throw new Error(stableError || `${resp.status} ${resp.statusText || 'Provider request failed'}`)
  }
  const parser = createParser((event) => {
    if (event.type === 'event') {
      onMessage(event.data)
    }
  })
  for await (const chunk of streamAsyncIterable(resp.body!)) {
    const str = new TextDecoder().decode(chunk)
    parser.feed(str)
  }
}
