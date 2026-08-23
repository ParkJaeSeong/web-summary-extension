import { Button, Card, Text, useToasts } from '@geist-ui/core'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { t } from '@/i18n'
import {
  ContentCacheItemSummary,
  deleteCachedContent,
  deleteCachedContentEmbeddings,
  listCachedContent,
} from '@/storage/content-cache'
import { clearConversations, listConversations } from '@/storage/conversations'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function LocalDataManager({ onChange }: { onChange: () => void }) {
  const [items, setItems] = useState<ContentCacheItemSummary[]>([])
  const [conversationCount, setConversationCount] = useState(0)
  const { setToast } = useToasts()

  const refresh = useCallback(async () => {
    const [cached, conversations] = await Promise.all([listCachedContent(), listConversations()])
    setItems(cached)
    setConversationCount(conversations.length)
    onChange()
  }, [onChange])

  useEffect(() => {
    refresh()
  }, [refresh])

  const removeItem = useCallback(
    async (key: string) => {
      await deleteCachedContent(key)
      await refresh()
    },
    [refresh],
  )

  const removeEmbeddings = useCallback(
    async (key: string) => {
      await deleteCachedContentEmbeddings(key)
      await refresh()
    },
    [refresh],
  )

  const removeConversations = useCallback(async () => {
    if (!window.confirm(t('clearConversationsConfirm', 'Delete all locally stored conversations?')))
      return
    await clearConversations()
    await refresh()
    setToast({ text: t('conversationsCleared', 'Conversations cleared'), type: 'success' })
  }, [refresh, setToast])

  return (
    <>
      <Text h3>{t('cachedContentManager', 'Cached content manager')}</Text>
      <Card>
        {items.length === 0 ? (
          <Text small>{t('noCachedContent', 'No cached content.')}</Text>
        ) : (
          <div className="cached-items">
            {items.map((item) => (
              <article className="cached-item" key={item.key}>
                <div className="cached-item__main">
                  <strong title={item.title}>{item.title || item.url}</strong>
                  <span>
                    {t(item.sourceType, item.sourceType)} ·{' '}
                    {new Date(item.savedAt).toLocaleString()} · {item.chunks}{' '}
                    {t('chunks', 'chunks')}
                  </span>
                  <span>
                    {t('textSize', 'Text')} {formatBytes(item.textBytes)} ·{' '}
                    {t('vectorSize', 'Vectors')} {formatBytes(item.vectorBytes)} ·{' '}
                    {item.embeddingModel || t('notIndexed', 'not indexed')}
                  </span>
                </div>
                <div className="cached-item__actions">
                  {item.embeddingModel && (
                    <button onClick={() => removeEmbeddings(item.key)}>
                      {t('deleteEmbeddings', 'Delete embeddings')}
                    </button>
                  )}
                  <button className="text-button--danger" onClick={() => removeItem(item.key)}>
                    {t('deleteItem', 'Delete item')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Text h3>{t('conversationStorage', 'Conversation storage')}</Text>
      <Card>
        <div className="setting-row">
          <div>
            <strong>
              {t('storedConversations', '$1 stored conversations', String(conversationCount))}
            </strong>
            <p>
              {t(
                'conversationStorageDescription',
                'Conversations are managed separately from cached source content.',
              )}
            </p>
          </div>
          <Button
            auto
            scale={2 / 3}
            type="error"
            ghost
            disabled={!conversationCount}
            onClick={removeConversations}
          >
            {t('clearConversations', 'Clear conversations')}
          </Button>
        </div>
      </Card>
    </>
  )
}
