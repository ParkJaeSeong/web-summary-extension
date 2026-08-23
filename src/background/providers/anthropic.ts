import { ChatProviderConfig, normalizeApiKey } from '@/config'
import { fetchSSE } from '../fetch-sse'
import { GenerateAnswerParams, Provider } from '../types'
import { providerRequestUrl } from '@/utils/url-security'

interface AnthropicStreamEvent {
  type?: string
  index?: number
  error?: { message?: string }
  delta?: { type?: string; text?: string }
}

export class AnthropicProvider implements Provider {
  constructor(private config: ChatProviderConfig) {}

  async generateAnswer(params: GenerateAnswerParams) {
    const url = providerRequestUrl(this.config.apiHost, this.config.apiPath || '/v1/messages')
    let result = ''
    let completed = false

    await fetchSSE(url, {
      method: 'POST',
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': normalizeApiKey(this.config.apiKey),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: params.prompt }],
        stream: true,
      }),
      onMessage(message) {
        let data: AnthropicStreamEvent
        try {
          data = JSON.parse(message)
        } catch {
          return
        }

        if (data.type === 'error') {
          throw new Error(data.error?.message || 'Claude request failed.')
        }
        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
          result += data.delta.text || ''
          params.onEvent({
            type: 'answer',
            data: {
              text: result,
              messageId: String(data.index ?? ''),
              conversationId: String(data.index ?? ''),
            },
          })
        } else if (data.type === 'message_stop') {
          completed = true
          params.onEvent({ type: 'done' })
        }
      },
    })

    if (!completed) params.onEvent({ type: 'done' })
    return {}
  }
}
