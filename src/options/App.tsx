import {
  DEFAULT_PROMPT_ACTIONS,
  getUserConfig,
  Language,
  PromptAction,
  updateUserConfig,
} from '@/config'
import {
  clearContentCache,
  ContentCacheStats,
  getContentCacheStats,
  pruneContentCache,
} from '@/storage/content-cache'
import { t } from '@/i18n'
import {
  Button,
  Card,
  CssBaseline,
  GeistProvider,
  Select,
  Text,
  Textarea,
  Toggle,
  useToasts,
} from '@geist-ui/core'
import { useCallback, useEffect, useState } from 'preact/hooks'
import Header from './components/Header'
import ProviderSelect from './ProviderSelect'
import LocalDataManager from './LocalDataManager'
import './styles.scss'

function OptionsPage() {
  const [language, setLanguage] = useState(Language.Auto)
  const [promptActions, setPromptActions] = useState<PromptAction[]>(DEFAULT_PROMPT_ACTIONS)
  const [pageButtonEnabled, setPageButtonEnabled] = useState(true)
  const [automaticIndexingEnabled, setAutomaticIndexingEnabled] = useState(false)
  const [cacheStats, setCacheStats] = useState<ContentCacheStats>()
  const [cacheMaxAgeDays, setCacheMaxAgeDays] = useState(30)
  const [cacheMaxItems, setCacheMaxItems] = useState(50)
  const [cacheRevision, setCacheRevision] = useState(0)
  const [obsidianVaultFolder, setObsidianVaultFolder] = useState('PageMind')
  const { setToast } = useToasts()

  const refreshCacheStats = useCallback(() => {
    getContentCacheStats().then(setCacheStats)
  }, [])

  useEffect(() => {
    getUserConfig().then((config) => {
      setLanguage(config.language)
      setPromptActions(config.promptActions)
      setPageButtonEnabled(config.pageButtonEnabled)
      setAutomaticIndexingEnabled(config.automaticIndexingEnabled)
      setCacheMaxAgeDays(config.contentCacheMaxAgeDays)
      setCacheMaxItems(config.contentCacheMaxItems)
      setObsidianVaultFolder(config.obsidianVaultFolder)
    })
    refreshCacheStats()
  }, [refreshCacheStats])

  const clearLocalContentCache = useCallback(async () => {
    if (
      !window.confirm(t('clearCacheConfirm', 'Delete all locally cached content and embeddings?'))
    )
      return
    await clearContentCache()
    refreshCacheStats()
    setCacheRevision((revision) => revision + 1)
    setToast({ text: t('cacheCleared', 'Local content cache cleared'), type: 'success' })
  }, [refreshCacheStats, setToast])

  const saveCachePolicy = useCallback(async () => {
    const days = Math.min(3650, Math.max(1, cacheMaxAgeDays || 30))
    const items = Math.min(1000, Math.max(1, cacheMaxItems || 50))
    setCacheMaxAgeDays(days)
    setCacheMaxItems(items)
    await updateUserConfig({ contentCacheMaxAgeDays: days, contentCacheMaxItems: items })
    await pruneContentCache()
    setCacheStats(await getContentCacheStats())
    setToast({ text: t('storagePolicySaved', 'Storage policy saved'), type: 'success' })
  }, [cacheMaxAgeDays, cacheMaxItems, setToast])

  const updatePromptAction = useCallback((id: string, updates: Partial<PromptAction>) => {
    setPromptActions((actions) =>
      actions.map((action) => (action.id === id ? { ...action, ...updates } : action)),
    )
  }, [])

  const addPromptAction = useCallback(() => {
    setPromptActions((actions) => [
      ...actions,
      { id: crypto.randomUUID(), label: t('newAction', 'New action'), prompt: '' },
    ])
  }, [])

  const save = useCallback(
    async (updates: Parameters<typeof updateUserConfig>[0]) => {
      await updateUserConfig(updates)
      setToast({ text: t('changesSaved', 'Changes saved'), type: 'success' })
    },
    [setToast],
  )

  return (
    <div className="options-shell">
      <Header />
      <main className="options-page">
        <Text h2>{t('settings', 'Settings')}</Text>

        <Text h3>{t('responseLanguage', 'Response language')}</Text>
        <Select
          value={language}
          onChange={(value) => {
            const nextLanguage = value as Language
            setLanguage(nextLanguage)
            save({ language: nextLanguage })
          }}
        >
          {Object.entries(Language).map(([label, value]) => (
            <Select.Option key={value} value={value}>
              {label}
            </Select.Option>
          ))}
        </Select>

        <Text h3>{t('aiProvider', 'AI provider')}</Text>
        <ProviderSelect />

        <Text h3>{t('promptActions', 'Prompt actions')}</Text>
        <Card>
          <Text small>
            {t(
              'promptActionsDescription',
              'Create reusable buttons for prompts you use frequently.',
            )}
          </Text>
          <div className="prompt-actions-editor">
            {promptActions.map((action) => (
              <div className="prompt-action-editor" key={action.id}>
                <input
                  value={action.label}
                  maxLength={30}
                  placeholder={t('buttonLabel', 'Button label')}
                  onInput={(event) =>
                    updatePromptAction(action.id, { label: event.currentTarget.value })
                  }
                />
                <Textarea
                  width="100%"
                  value={action.prompt}
                  placeholder={t(
                    'promptPlaceholder',
                    'Enter the prompt sent when this button is clicked.',
                  )}
                  onChange={(event) =>
                    updatePromptAction(action.id, { prompt: event.target.value })
                  }
                />
                <button
                  className="text-button text-button--danger"
                  onClick={() =>
                    setPromptActions((actions) =>
                      actions.filter((candidate) => candidate.id !== action.id),
                    )
                  }
                >
                  {t('remove', 'Remove')}
                </button>
              </div>
            ))}
            <button className="text-button" onClick={addPromptAction}>
              {t('addPromptButton', '+ Add prompt button')}
            </button>
          </div>
          <Card.Footer>
            <Button
              auto
              scale={2 / 3}
              type="success"
              onClick={() =>
                save({
                  promptActions: promptActions.filter(
                    (action) => action.label.trim() && action.prompt.trim(),
                  ),
                })
              }
            >
              {t('savePromptButtons', 'Save prompt buttons')}
            </Button>
          </Card.Footer>
        </Card>

        <Text h3>{t('pageButton', 'Page button')}</Text>
        <Card>
          <div className="setting-row">
            <div>
              <strong>{t('showPageMind', 'Show PageMind on webpages')}</strong>
              <p>
                {t(
                  'pageButtonPrivacy',
                  'Nothing is sent until you open the side panel and ask a question.',
                )}
              </p>
            </div>
            <Toggle
              checked={pageButtonEnabled}
              onChange={(event) => {
                const enabled = event.target.checked
                setPageButtonEnabled(enabled)
                save({ pageButtonEnabled: enabled })
              }}
            />
          </div>
        </Card>

        <Text h3>{t('obsidianExport', 'Obsidian export')}</Text>
        <Card>
          <Text small>
            {t(
              'obsidianFolderDescription',
              'Notes are saved in this folder inside the Vault you select. Nested paths such as Inbox/PageMind are supported.',
            )}
          </Text>
          <div className="obsidian-folder-setting">
            <label>
              <span>{t('obsidianFolder', 'Folder inside Vault')}</span>
              <input
                value={obsidianVaultFolder}
                placeholder="PageMind"
                onInput={(event) => setObsidianVaultFolder(event.currentTarget.value)}
              />
            </label>
            <Button
              auto
              scale={2 / 3}
              onClick={() => save({ obsidianVaultFolder: obsidianVaultFolder.trim() })}
            >
              {t('saveObsidianFolder', 'Save folder')}
            </Button>
          </div>
        </Card>

        <Text h3>{t('localContentStorage', 'Local content storage')}</Text>
        <Card>
          <div className="setting-row">
            <div>
              <strong>
                {t(
                  'cachedItemCount',
                  '$1 cached content items',
                  String(cacheStats?.documents || 0),
                )}
              </strong>
              <p>
                {t('cacheStats', '$1 content chunks · $2 embeddings · $3 MB estimated', [
                  (cacheStats?.contentChunks || 0).toLocaleString(),
                  (cacheStats?.embeddedChunks || 0).toLocaleString(),
                  ((cacheStats?.approximateBytes || 0) / 1024 / 1024).toFixed(1),
                ])}
              </p>
            </div>
            <Button auto scale={2 / 3} type="error" ghost onClick={clearLocalContentCache}>
              {t('clearCache', 'Clear cache')}
            </Button>
          </div>
          <Text small>
            {t('clearCacheNotice', 'Clearing cached content does not delete conversations.')}
          </Text>
          <div className="cache-policy">
            <label>
              <span>{t('keepContentFor', 'Keep content for')}</span>
              <input
                type="number"
                min="1"
                max="3650"
                value={cacheMaxAgeDays}
                onInput={(event) => setCacheMaxAgeDays(Number(event.currentTarget.value))}
              />
              <span>{t('days', 'days')}</span>
            </label>
            <label>
              <span>{t('maximumItems', 'Maximum items')}</span>
              <input
                type="number"
                min="1"
                max="1000"
                value={cacheMaxItems}
                onInput={(event) => setCacheMaxItems(Number(event.currentTarget.value))}
              />
            </label>
            <Button auto scale={2 / 3} onClick={saveCachePolicy}>
              {t('saveStoragePolicy', 'Save storage policy')}
            </Button>
          </div>
        </Card>

        <LocalDataManager key={cacheRevision} onChange={refreshCacheStats} />

        <Text h3>{t('privacyAndCost', 'Privacy and AI usage')}</Text>
        <Card>
          <div className="privacy-list">
            <div>
              <strong>{t('storedOnDevice', 'Stored on this device')}</strong>
              <p>
                {t(
                  'storedOnDeviceDescription',
                  'Page context, conversations, embeddings, prompt buttons, and page memory are stored in browser local storage and IndexedDB.',
                )}
              </p>
            </div>
            <div>
              <strong>{t('sentToChatProvider', 'Sent to the chat provider')}</strong>
              <p>
                {t(
                  'sentToChatProviderDescription',
                  'Only when you ask: your question, conversation, and selected source excerpts.',
                )}
              </p>
            </div>
            <div>
              <strong>{t('sentToEmbeddingProvider', 'Sent to the embedding provider')}</strong>
              <p>
                {t(
                  'sentToEmbeddingProviderDescription',
                  'When semantic indexing or search is enabled: content chunks, compact page cards, and search queries.',
                )}
              </p>
            </div>
            <div>
              <strong>{t('pdfAccessDisclosure', 'PDF website access')}</strong>
              <p>
                {t(
                  'pdfAccessDisclosureDescription',
                  'PageMind requests access only to the PDF website you choose. Local files require Chrome file access permission.',
                )}
              </p>
            </div>
            <div>
              <strong>{t('apiKeyStorage', 'API key storage')}</strong>
              <p>
                {t(
                  'apiKeyStorageDescription',
                  'API keys are stored in Chrome local extension storage, not sync storage. They are not protected like passwords from someone who can access your browser profile.',
                )}
              </p>
            </div>
          </div>
          <div className="setting-row setting-row--bordered">
            <div>
              <strong>{t('automaticIndexing', 'Automatically create content embeddings')}</strong>
              <p>
                {t(
                  'automaticIndexingDescription',
                  'May send many content chunks to a remote embedding API and may incur provider charges.',
                )}
              </p>
            </div>
            <Toggle
              checked={automaticIndexingEnabled}
              onChange={(event) => {
                const enabled = event.target.checked
                setAutomaticIndexingEnabled(enabled)
                save({ automaticIndexingEnabled: enabled })
              }}
            />
          </div>
        </Card>
      </main>
    </div>
  )
}

export default function App() {
  const themeType = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

  return (
    <GeistProvider themeType={themeType}>
      <CssBaseline />
      <OptionsPage />
    </GeistProvider>
  )
}
