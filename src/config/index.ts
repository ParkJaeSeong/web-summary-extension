import Browser from 'webextension-polyfill'

export enum Language {
  Auto = 'auto',
  English = 'en-US',
  ChineseSimplified = 'zh-Hans',
  ChineseTraditional = 'zh-Hant',
  Spanish = 'es-ES',
  French = 'fr-FR',
  Korean = 'ko-KR',
  Japanese = 'ja-JP',
  German = 'de-DE',
  Portuguese = 'pt-PT',
  Russian = 'ru-RU',
}

export interface PromptAction {
  id: string
  label: string
  prompt: string
}

export const DEFAULT_PROMPT_ACTIONS: PromptAction[] = [
  {
    id: 'summary',
    label: 'Summary',
    prompt: 'Summarize this content concisely and list the key points.',
  },
  {
    id: 'insights',
    label: 'Key insights',
    prompt:
      'Identify the most important insights, claims, and supporting evidence in this content.',
  },
  {
    id: 'explain',
    label: 'Explain simply',
    prompt: 'Explain this content in simple language for someone new to the topic.',
  },
]

const userConfigWithDefaultValue: {
  language: Language
  promptPage: string
  promptActions: PromptAction[]
  pageButtonEnabled: boolean
  pageButtonPosition: { x: number; y: number } | null
  pageMemoryEnabled: boolean
  semanticMemoryEnabled: boolean
  automaticIndexingEnabled: boolean
  youtubeCaptionLanguage: string
  contentCacheMaxAgeDays: number
  contentCacheMaxItems: number
  obsidianVaultFolder: string
} = {
  language: Language.Auto,
  promptPage: '',
  promptActions: DEFAULT_PROMPT_ACTIONS,
  pageButtonEnabled: true,
  pageButtonPosition: null,
  pageMemoryEnabled: false,
  semanticMemoryEnabled: false,
  automaticIndexingEnabled: false,
  youtubeCaptionLanguage: 'auto',
  contentCacheMaxAgeDays: 30,
  contentCacheMaxItems: 50,
  obsidianVaultFolder: 'PageMind',
}

export type UserConfig = typeof userConfigWithDefaultValue

export async function getUserConfig(): Promise<UserConfig> {
  const result = await Browser.storage.local.get(Object.keys(userConfigWithDefaultValue))
  const storedValues = Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined),
  )
  const promptActions = Array.isArray(result.promptActions)
    ? result.promptActions
    : result.promptPage
    ? [{ id: 'summary', label: 'Summary', prompt: result.promptPage }]
    : DEFAULT_PROMPT_ACTIONS
  return { ...userConfigWithDefaultValue, ...storedValues, promptActions }
}

export async function updateUserConfig(updates: Partial<UserConfig>) {
  return Browser.storage.local.set(updates)
}

export enum ProviderType {
  OpenAI = 'openai',
  Gemini = 'gemini',
  Anthropic = 'anthropic',
  Compatible = 'compatible',
}

export interface ChatProviderConfig {
  model: string
  apiKey: string
  apiHost: string
  apiPath: string
}

export interface ProviderConfigs {
  provider: ProviderType
  configs: Record<ProviderType, ChatProviderConfig>
}

export function normalizeApiKey(value: string) {
  return value
    .trim()
    .replace(/^Bearer\s+/i, '')
    .trim()
}

export async function getProviderConfigs(): Promise<ProviderConfigs> {
  const keys = Object.values(ProviderType).map((provider) => `provider:${provider}`)
  const result = await Browser.storage.local.get(['provider', 'provider:gpt3', ...keys])
  const legacy = result['provider:gpt3'] ?? {}
  const storedProvider = Object.values(ProviderType).includes(result.provider)
    ? result.provider
    : ProviderType.OpenAI

  return {
    provider: storedProvider,
    configs: Object.fromEntries(
      Object.values(ProviderType).map((provider) => [
        provider,
        {
          ...DEFAULT_PROVIDER_CONFIGS[provider],
          ...(provider === ProviderType.OpenAI ? legacy : {}),
          ...(result[`provider:${provider}`] ?? {}),
        },
      ]),
    ) as Record<ProviderType, ChatProviderConfig>,
  }
}

export async function saveProviderConfig(provider: ProviderType, config: ChatProviderConfig) {
  return Browser.storage.local.set({
    provider,
    [`provider:${provider}`]: {
      ...config,
      model: config.model.trim(),
      apiKey: normalizeApiKey(config.apiKey),
      apiHost: config.apiHost.trim(),
      apiPath: config.apiPath.trim(),
    },
  })
}

export interface EmbeddingConfig {
  provider: EmbeddingProviderType
  model: string
  apiKey: string
  apiHost: string
  apiPath: string
}

export enum EmbeddingProviderType {
  OpenAI = 'openai',
  Gemini = 'gemini',
  Compatible = 'compatible',
}

export const DEFAULT_EMBEDDING_CONFIGS: Record<EmbeddingProviderType, EmbeddingConfig> = {
  [EmbeddingProviderType.OpenAI]: {
    provider: EmbeddingProviderType.OpenAI,
    model: 'text-embedding-3-small',
    apiKey: '',
    apiHost: 'https://api.openai.com',
    apiPath: '/v1/embeddings',
  },
  [EmbeddingProviderType.Gemini]: {
    provider: EmbeddingProviderType.Gemini,
    model: 'gemini-embedding-001',
    apiKey: '',
    apiHost: 'https://generativelanguage.googleapis.com',
    apiPath: '/v1beta/openai/embeddings',
  },
  [EmbeddingProviderType.Compatible]: {
    provider: EmbeddingProviderType.Compatible,
    model: 'nomic-embed-text',
    apiKey: '',
    apiHost: 'http://localhost:11434',
    apiPath: '/v1/embeddings',
  },
}

export async function getEmbeddingConfig(): Promise<EmbeddingConfig> {
  const result = await Browser.storage.local.get(['embedding:config', 'provider:gpt3'])
  const legacy = result['provider:gpt3'] ?? {}
  const stored = result['embedding:config'] ?? {}
  const provider = Object.values(EmbeddingProviderType).includes(stored.provider)
    ? stored.provider
    : String(stored.apiHost || legacy.apiHost || '').includes('generativelanguage.googleapis.com')
    ? EmbeddingProviderType.Gemini
    : /localhost|127\.0\.0\.1/.test(stored.apiHost || legacy.apiHost || '')
    ? EmbeddingProviderType.Compatible
    : EmbeddingProviderType.OpenAI
  return {
    ...DEFAULT_EMBEDDING_CONFIGS[provider],
    model: legacy.embeddingModel || DEFAULT_EMBEDDING_CONFIGS[provider].model,
    apiKey: legacy.apiKey || '',
    apiHost: legacy.apiHost || DEFAULT_EMBEDDING_CONFIGS[provider].apiHost,
    apiPath: legacy.embeddingPath || DEFAULT_EMBEDDING_CONFIGS[provider].apiPath,
    ...stored,
    provider,
  }
}

export async function saveEmbeddingConfig(config: EmbeddingConfig) {
  return Browser.storage.local.set({
    'embedding:config': {
      ...config,
      model: config.model.trim(),
      apiKey: normalizeApiKey(config.apiKey),
      apiHost: config.apiHost.trim(),
      apiPath: config.apiPath.trim(),
    },
  })
}

export const APP_TITLE = `PageMind`

export const DEFAULT_MODEL = 'gpt-5-mini'
export const DEFAULT_API_HOST = 'https://api.openai.com'
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

export const DEFAULT_PROVIDER_CONFIGS: Record<ProviderType, ChatProviderConfig> = {
  [ProviderType.OpenAI]: {
    model: DEFAULT_MODEL,
    apiKey: '',
    apiHost: DEFAULT_API_HOST,
    apiPath: '/v1/chat/completions',
  },
  [ProviderType.Gemini]: {
    model: 'gemini-3.6-flash',
    apiKey: '',
    apiHost: 'https://generativelanguage.googleapis.com',
    apiPath: '/v1beta/openai/chat/completions',
  },
  [ProviderType.Anthropic]: {
    model: 'claude-sonnet-4-20250514',
    apiKey: '',
    apiHost: 'https://api.anthropic.com',
    apiPath: '/v1/messages',
  },
  [ProviderType.Compatible]: {
    model: DEFAULT_MODEL,
    apiKey: '',
    apiHost: 'http://localhost:11434',
    apiPath: '/v1/chat/completions',
  },
}
