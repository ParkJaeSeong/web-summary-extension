import { ChatProviderConfig, DEFAULT_API_HOST, DEFAULT_MODEL, normalizeApiKey } from '@/config'
import { fetchSSE } from '../fetch-sse'
import { GenerateAnswerParams, Provider } from '../types'
import { providerRequestUrl } from '@/utils/url-security'

export class OpenAIProvider implements Provider {
  constructor(
    private config: ChatProviderConfig,
    private extraHeaders: Record<string, string> = {},
  ) {}

  private buildMessages(prompt: string) {
    return [{ role: 'user', content: prompt }]
  }

  async generateAnswer(params: GenerateAnswerParams) {
    const gptModel = this.config.model || DEFAULT_MODEL
    const apiHost = this.config.apiHost || DEFAULT_API_HOST
    const apiPath = this.config.apiPath

    const url = providerRequestUrl(apiHost, apiPath || '/v1/chat/completions')
    const reqParams = {
      model: gptModel,
      messages: this.buildMessages(params.prompt),
      stream: true,
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.extraHeaders,
    }
    const apiKey = normalizeApiKey(this.config.apiKey)
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    let result = ''
    await fetchSSE(url, {
      method: 'POST',
      signal: params.signal,
      headers,
      body: JSON.stringify(reqParams),
      onMessage(message) {
        if (message === '[DONE]') {
          params.onEvent({ type: 'done' })
          return
        }
        let data
        try {
          data = JSON.parse(message)
          const text = data.choices?.[0]?.delta?.content

          if (text === undefined || text === '<|im_end|>' || text === '<|im_sep|>') {
            return
          }
          result += text
          params.onEvent({
            type: 'answer',
            data: {
              text: result,
              messageId: data.id,
              conversationId: data.id,
            },
          })
        } catch {
          return
        }
      },
    })
    return {}
  }
}
