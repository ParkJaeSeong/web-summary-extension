import {
  DEFAULT_API_HOST,
  DEFAULT_EMBEDDING_MODEL,
  EmbeddingConfig,
  normalizeApiKey,
} from '@/config'
import { providerRequestUrl } from '@/utils/url-security'

export interface EmbeddingResult {
  model: string
  vectors: number[][]
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<EmbeddingResult>
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  constructor(private config: EmbeddingConfig) {}

  async embed(texts: string[]): Promise<EmbeddingResult> {
    const model = this.config.model || DEFAULT_EMBEDDING_MODEL
    const configuredHost = this.config.apiHost || DEFAULT_API_HOST
    const url = providerRequestUrl(configuredHost, this.config.apiPath || '/v1/embeddings')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const apiKey = normalizeApiKey(this.config.apiKey)
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: texts }),
    })
    if (!response.ok) {
      // Provider bodies may echo submitted content, so expose only stable status metadata.
      throw new Error(`Embedding request failed: ${response.status}`)
    }
    const data = await response.json()
    const vectors = (data.data || [])
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding)
    if (
      vectors.length !== texts.length ||
      vectors.some(
        (vector) =>
          !Array.isArray(vector) ||
          vector.length === 0 ||
          vector.some((value) => !Number.isFinite(value)),
      )
    ) {
      throw new Error('Embedding response was incomplete or invalid.')
    }
    return { model: data.model || model, vectors }
  }
}
