import {
  ChatProviderConfig,
  DEFAULT_EMBEDDING_CONFIGS,
  EmbeddingConfig,
  EmbeddingProviderType,
  getEmbeddingConfig,
  getProviderConfigs,
  ProviderConfigs,
  ProviderType,
  saveEmbeddingConfig,
  saveProviderConfig,
} from '@/config'
import { Button, Card, Input, Spinner, useToasts } from '@geist-ui/core'
import { useCallback, useEffect, useState } from 'react'
import Browser from 'webextension-polyfill'
import { PageMindError, userErrorMessage } from '@/utils/errors'
import { t } from '@/i18n'
import { isLocalHostname, parseSafeHttpUrl, permissionOrigin } from '@/utils/url-security'

const PROVIDER_LABELS: Record<ProviderType, string> = {
  [ProviderType.OpenAI]: 'OpenAI',
  [ProviderType.Gemini]: 'Google Gemini',
  [ProviderType.Anthropic]: 'Anthropic Claude',
  [ProviderType.Compatible]: 'OpenAI-compatible / Local',
}

const KEY_LINKS: Partial<Record<ProviderType, string>> = {
  [ProviderType.OpenAI]: 'https://platform.openai.com/api-keys',
  [ProviderType.Gemini]: 'https://aistudio.google.com/app/apikey',
  [ProviderType.Anthropic]: 'https://console.anthropic.com/settings/keys',
}

const EMBEDDING_PROVIDER_LABELS: Record<EmbeddingProviderType, string> = {
  [EmbeddingProviderType.OpenAI]: 'OpenAI',
  [EmbeddingProviderType.Gemini]: 'Google Gemini',
  [EmbeddingProviderType.Compatible]: 'OpenAI-compatible / Local',
}

export function isLocalProviderHost(apiHost: string) {
  try {
    return isLocalHostname(parseSafeHttpUrl(apiHost).hostname)
  } catch {
    return false
  }
}

async function requestOriginPermission(apiHost: string) {
  const origin = permissionOrigin(apiHost)
  const granted = await Browser.permissions.request({ origins: [origin] }).catch(() => false)
  if (!granted) throw new PageMindError('PROVIDER_PERMISSION_DENIED')
}

export default function ProviderSelect() {
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfigs>()
  const [provider, setProvider] = useState(ProviderType.OpenAI)
  const [chatConfig, setChatConfig] = useState<ChatProviderConfig>()
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>()
  const [error, setError] = useState('')
  const { setToast } = useToasts()

  useEffect(() => {
    Promise.all([getProviderConfigs(), getEmbeddingConfig()])
      .then(([chat, embedding]) => {
        setProviderConfigs(chat)
        setProvider(chat.provider)
        setChatConfig(chat.configs[chat.provider])
        setEmbeddingConfig(embedding)
      })
      .catch((err) => setError(err.message))
  }, [])

  const updateChat = useCallback((updates: Partial<ChatProviderConfig>) => {
    setChatConfig((current) => (current ? { ...current, ...updates } : current))
  }, [])

  const updateEmbedding = useCallback((updates: Partial<EmbeddingConfig>) => {
    setEmbeddingConfig((current) => (current ? { ...current, ...updates } : current))
  }, [])

  const selectEmbeddingProvider = useCallback((provider: EmbeddingProviderType) => {
    setEmbeddingConfig(DEFAULT_EMBEDDING_CONFIGS[provider])
  }, [])

  const selectProvider = useCallback(
    (nextProvider: ProviderType) => {
      if (!providerConfigs) return
      setProvider(nextProvider)
      setChatConfig(providerConfigs.configs[nextProvider])
    },
    [providerConfigs],
  )

  const saveChat = useCallback(async () => {
    if (!chatConfig?.model.trim()) return alert(t('enterModel', 'Please enter a model name.'))
    const isLocal = isLocalProviderHost(chatConfig.apiHost)
    if (!chatConfig.apiKey && !isLocal) return alert(t('enterApiKey', 'Please enter an API key.'))
    try {
      await requestOriginPermission(chatConfig.apiHost)
      await saveProviderConfig(provider, { ...chatConfig, model: chatConfig.model.trim() })
      setProviderConfigs((current) =>
        current ? { provider, configs: { ...current.configs, [provider]: chatConfig } } : current,
      )
      setToast({ text: t('providerSaved', '$1 saved', PROVIDER_LABELS[provider]), type: 'success' })
    } catch (error: unknown) {
      alert(userErrorMessage(error, 'CHAT_REQUEST_FAILED'))
    }
  }, [chatConfig, provider, setToast])

  const saveEmbedding = useCallback(async () => {
    if (!embeddingConfig?.model.trim())
      return alert(t('enterEmbeddingModel', 'Please enter an embedding model.'))
    const isLocal = isLocalProviderHost(embeddingConfig.apiHost)
    if (!embeddingConfig.apiKey && !isLocal)
      return alert(t('enterEmbeddingApiKey', 'Please enter an embedding API key.'))
    try {
      await requestOriginPermission(embeddingConfig.apiHost)
      await saveEmbeddingConfig(embeddingConfig)
      setToast({ text: t('embeddingProviderSaved', 'Embedding provider saved'), type: 'success' })
    } catch (error: unknown) {
      alert(userErrorMessage(error, 'EMBEDDING_FAILED'))
    }
  }, [embeddingConfig, setToast])

  if (error)
    return (
      <div>
        {t('providerLoadFailed', 'Error loading provider configuration:')} {error}
      </div>
    )
  if (!providerConfigs || !chatConfig || !embeddingConfig) return <Spinner />

  return (
    <div className="provider-stack">
      <Card className="provider-card">
        <div className="provider-form">
          <label className="provider-select">
            <strong>{t('chatProvider', 'Chat provider')}</strong>
            <select
              value={provider}
              onChange={(event) => selectProvider(event.currentTarget.value as ProviderType)}
            >
              {Object.values(ProviderType).map((value) => (
                <option key={value} value={value}>
                  {PROVIDER_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <div className="provider-grid">
            <Input
              value={chatConfig.apiHost}
              onChange={(event) => updateChat({ apiHost: event.target.value })}
              label={t('apiHost', 'API Host')}
              scale={2 / 3}
            />
            <Input
              value={chatConfig.apiPath}
              onChange={(event) => updateChat({ apiPath: event.target.value })}
              label={t('apiPath', 'API Path')}
              scale={2 / 3}
            />
            <Input
              value={chatConfig.model}
              onChange={(event) => updateChat({ model: event.target.value })}
              label={t('model', 'Model')}
              scale={2 / 3}
            />
            <Input
              htmlType="password"
              value={chatConfig.apiKey}
              onChange={(event) => updateChat({ apiKey: event.target.value })}
              label={t('apiKey', 'API key')}
              scale={2 / 3}
            />
          </div>
          {KEY_LINKS[provider] && (
            <a
              className="provider-hint"
              href={KEY_LINKS[provider]}
              target="_blank"
              rel="noreferrer"
            >
              {t('createApiKey', 'Create a $1 API key', PROVIDER_LABELS[provider])}
            </a>
          )}
          <Card.Footer>
            <Button auto scale={2 / 3} type="success" onClick={saveChat}>
              {t('saveChatProvider', 'Save chat provider')}
            </Button>
          </Card.Footer>
        </div>
      </Card>

      <Card className="provider-card">
        <div className="provider-form">
          <div>
            <strong>{t('embeddingProvider', 'Embedding provider')}</strong>
            <p className="provider-description">
              {t(
                'embeddingDescription',
                'Used for semantic search across content and page memory. It is independent from the chat provider.',
              )}
            </p>
          </div>
          <label className="provider-select">
            <span>{t('embeddingService', 'Embedding service')}</span>
            <select
              value={embeddingConfig.provider}
              onChange={(event) =>
                selectEmbeddingProvider(event.currentTarget.value as EmbeddingProviderType)
              }
            >
              {Object.values(EmbeddingProviderType).map((value) => (
                <option key={value} value={value}>
                  {EMBEDDING_PROVIDER_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <div className="provider-grid">
            <Input
              value={embeddingConfig.apiHost}
              onChange={(event) => updateEmbedding({ apiHost: event.target.value })}
              label={t('apiHost', 'API Host')}
              scale={2 / 3}
            />
            <Input
              value={embeddingConfig.apiPath}
              onChange={(event) => updateEmbedding({ apiPath: event.target.value })}
              label={t('apiPath', 'API Path')}
              scale={2 / 3}
            />
            <Input
              value={embeddingConfig.model}
              onChange={(event) => updateEmbedding({ model: event.target.value })}
              label={t('model', 'Model')}
              scale={2 / 3}
            />
            <Input
              htmlType="password"
              value={embeddingConfig.apiKey}
              onChange={(event) => updateEmbedding({ apiKey: event.target.value })}
              label={t('apiKey', 'API key')}
              scale={2 / 3}
            />
          </div>
          <p
            className={`provider-location provider-location--${
              isLocalProviderHost(embeddingConfig.apiHost) ? 'local' : 'remote'
            }`}
          >
            {isLocalProviderHost(embeddingConfig.apiHost)
              ? t('localEmbeddingProvider', 'Local provider · content stays on this device')
              : t(
                  'remoteEmbeddingProvider',
                  'Remote provider · indexed content is sent outside this browser',
                )}
          </p>
          <Card.Footer>
            <Button auto scale={2 / 3} type="success" onClick={saveEmbedding}>
              {t('saveEmbeddingProvider', 'Save embedding provider')}
            </Button>
          </Card.Footer>
        </div>
      </Card>
    </div>
  )
}
