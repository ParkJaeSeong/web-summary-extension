import Browser from 'webextension-polyfill'
import { describe, expect, it } from 'vitest'
import {
  EmbeddingProviderType,
  getEmbeddingConfig,
  getUserConfig,
  normalizeApiKey,
  ProviderType,
} from './index'

describe('configuration migration', () => {
  it('normalizes copied API keys without duplicating the Bearer prefix', () => {
    expect(normalizeApiKey('  Bearer felo-secret-key\n')).toBe('felo-secret-key')
    expect(normalizeApiKey('  felo-secret-key  ')).toBe('felo-secret-key')
  })

  it('does not make paid embedding calls automatically by default', async () => {
    expect((await getUserConfig()).automaticIndexingEnabled).toBe(false)
  })

  it('migrates the legacy summary prompt into a prompt action', async () => {
    await Browser.storage.local.set({ promptPage: 'Explain this old prompt.' })

    const config = await getUserConfig()

    expect(config.promptActions).toEqual([
      { id: 'summary', label: 'Summary', prompt: 'Explain this old prompt.' },
    ])
  })

  it('migrates legacy OpenAI embedding settings', async () => {
    await Browser.storage.local.set({
      'provider:gpt3': {
        apiKey: 'legacy-key',
        apiHost: 'https://legacy.example.com',
        embeddingModel: 'legacy-embedding',
        embeddingPath: '/embeddings',
      },
    })

    const config = await getEmbeddingConfig()

    expect(config).toMatchObject({
      provider: EmbeddingProviderType.OpenAI,
      apiKey: 'legacy-key',
      apiHost: 'https://legacy.example.com',
      model: 'legacy-embedding',
      apiPath: '/embeddings',
    })
  })

  it('infers local and Gemini embedding providers from legacy hosts', async () => {
    await Browser.storage.local.set({ 'provider:gpt3': { apiHost: 'http://localhost:11434' } })
    expect((await getEmbeddingConfig()).provider).toBe(EmbeddingProviderType.Compatible)

    await Browser.storage.local.set({
      'provider:gpt3': { apiHost: 'https://generativelanguage.googleapis.com' },
    })
    expect((await getEmbeddingConfig()).provider).toBe(EmbeddingProviderType.Gemini)
  })

  it('falls back from an unknown chat provider to OpenAI', async () => {
    await Browser.storage.local.set({ provider: 'removed-provider' })
    const { getProviderConfigs } = await import('./index')

    expect((await getProviderConfigs()).provider).toBe(ProviderType.OpenAI)
  })
})
