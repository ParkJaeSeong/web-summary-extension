import { PageContext } from '@/core/page-context'
import { getUserConfig } from '@/config'
import { CONTENT_CACHE_STORE, openDatabase, requestToPromise } from './database'

const DAY_MS = 24 * 60 * 60 * 1000

export interface ContentEmbeddings {
  model: string
  vectors: number[][]
}

export interface CachedContent {
  key: string
  context: PageContext
  savedAt: number
  embeddings?: ContentEmbeddings
}

export interface ContentCacheStats {
  documents: number
  contentChunks: number
  embeddedChunks: number
  approximateBytes: number
}

export interface ContentCacheItemSummary {
  key: string
  url: string
  title: string
  sourceType: PageContext['sourceType']
  savedAt: number
  chunks: number
  textBytes: number
  vectorBytes: number
  embeddingModel?: string
}

function summarizeCachedContent(item: CachedContent): ContentCacheItemSummary {
  return {
    key: item.key,
    url: item.context.url,
    title: item.context.title,
    sourceType: item.context.sourceType,
    savedAt: item.savedAt,
    chunks: item.context.chunks.length,
    textBytes: item.context.chunks.reduce((total, chunk) => total + chunk.text.length * 2, 0),
    // IndexedDB stores JavaScript numbers. Estimate vectors without serializing large arrays.
    vectorBytes:
      item.embeddings?.vectors.reduce((total, vector) => total + vector.length * 8, 0) || 0,
    embeddingModel: item.embeddings?.model,
  }
}

export function hasCurrentEmbeddings(
  context: PageContext,
  embeddings: ContentEmbeddings | undefined,
  model: string,
) {
  return embeddings?.model === model && embeddings.vectors.length === context.chunks.length
}

function contentKey(url: string, captionLanguage = 'auto') {
  const parsed = new URL(url)
  const videoId = parsed.hostname.endsWith('youtube.com') ? parsed.searchParams.get('v') : undefined
  if (videoId) return `youtube:${videoId}:${captionLanguage}`
  parsed.hash = ''
  return parsed.href
}

function normalizeCachedContext(context: PageContext) {
  if (context.extraction) return context
  const legacyContext = context as PageContext & { truncated?: boolean }
  const totalUnits = legacyContext.totalPages || legacyContext.chunks.length
  return {
    ...legacyContext,
    extraction: {
      status: legacyContext.truncated ? ('partial' as const) : ('complete' as const),
      processedUnits: legacyContext.chunks.length,
      totalUnits,
      truncated: Boolean(legacyContext.truncated),
    },
  }
}

export async function getCachedContent(url: string, captionLanguage = 'auto') {
  const config = await getUserConfig()
  const maxAge = config.contentCacheMaxAgeDays * DAY_MS
  const database = await openDatabase()
  try {
    const transaction = database.transaction(CONTENT_CACHE_STORE, 'readonly')
    const cached = await requestToPromise(
      transaction
        .objectStore(CONTENT_CACHE_STORE)
        .get(contentKey(url, captionLanguage)) as IDBRequest<CachedContent | undefined>,
    )
    if (!cached || Date.now() - cached.savedAt > maxAge) return
    return { ...cached, context: normalizeCachedContext(cached.context) }
  } finally {
    database.close()
  }
}

export async function saveContentEmbeddings(
  url: string,
  embeddings: ContentEmbeddings,
  captionLanguage = 'auto',
) {
  const database = await openDatabase()
  try {
    const readStore = database
      .transaction(CONTENT_CACHE_STORE, 'readonly')
      .objectStore(CONTENT_CACHE_STORE)
    const cached = await requestToPromise(
      readStore.get(contentKey(url, captionLanguage)) as IDBRequest<CachedContent | undefined>,
    )
    if (!cached) return
    const writeStore = database
      .transaction(CONTENT_CACHE_STORE, 'readwrite')
      .objectStore(CONTENT_CACHE_STORE)
    await requestToPromise(writeStore.put({ ...cached, embeddings }))
  } finally {
    database.close()
  }
}

export async function getContentCacheStats(): Promise<ContentCacheStats> {
  const database = await openDatabase()
  try {
    const store = database
      .transaction(CONTENT_CACHE_STORE, 'readonly')
      .objectStore(CONTENT_CACHE_STORE)
    const cached = await requestToPromise(store.getAll() as IDBRequest<CachedContent[]>)
    return cached.map(summarizeCachedContent).reduce(
      (stats, item) => ({
        documents: stats.documents + 1,
        contentChunks: stats.contentChunks + item.chunks,
        embeddedChunks: stats.embeddedChunks + (item.vectorBytes ? item.chunks : 0),
        approximateBytes: stats.approximateBytes + item.textBytes + item.vectorBytes,
      }),
      { documents: 0, contentChunks: 0, embeddedChunks: 0, approximateBytes: 0 },
    )
  } finally {
    database.close()
  }
}

export async function listCachedContent(): Promise<ContentCacheItemSummary[]> {
  const database = await openDatabase()
  try {
    const store = database
      .transaction(CONTENT_CACHE_STORE, 'readonly')
      .objectStore(CONTENT_CACHE_STORE)
    const cached = await requestToPromise(store.getAll() as IDBRequest<CachedContent[]>)
    return cached.map(summarizeCachedContent).sort((left, right) => right.savedAt - left.savedAt)
  } finally {
    database.close()
  }
}

export async function getCachedContentByKey(key: string): Promise<CachedContent | undefined> {
  const config = await getUserConfig()
  const database = await openDatabase()
  try {
    const store = database
      .transaction(CONTENT_CACHE_STORE, 'readonly')
      .objectStore(CONTENT_CACHE_STORE)
    const cached = await requestToPromise(store.get(key) as IDBRequest<CachedContent | undefined>)
    if (!cached || Date.now() - cached.savedAt > config.contentCacheMaxAgeDays * DAY_MS) return
    return { ...cached, context: normalizeCachedContext(cached.context) }
  } finally {
    database.close()
  }
}

export async function deleteCachedContent(key: string) {
  const database = await openDatabase()
  try {
    const store = database
      .transaction(CONTENT_CACHE_STORE, 'readwrite')
      .objectStore(CONTENT_CACHE_STORE)
    await requestToPromise(store.delete(key))
  } finally {
    database.close()
  }
}

export async function deleteCachedContentEmbeddings(key: string) {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(CONTENT_CACHE_STORE, 'readwrite')
    const store = transaction.objectStore(CONTENT_CACHE_STORE)
    const cached = await requestToPromise(store.get(key) as IDBRequest<CachedContent | undefined>)
    if (!cached?.embeddings) return
    const withoutEmbeddings = { ...cached }
    delete withoutEmbeddings.embeddings
    await requestToPromise(store.put(withoutEmbeddings))
  } finally {
    database.close()
  }
}

export async function clearContentCache() {
  const database = await openDatabase()
  try {
    const store = database
      .transaction(CONTENT_CACHE_STORE, 'readwrite')
      .objectStore(CONTENT_CACHE_STORE)
    await requestToPromise(store.clear())
  } finally {
    database.close()
  }
}

export async function pruneContentCache() {
  const config = await getUserConfig()
  const database = await openDatabase()
  try {
    const readStore = database
      .transaction(CONTENT_CACHE_STORE, 'readonly')
      .objectStore(CONTENT_CACHE_STORE)
    const cached = await requestToPromise(readStore.getAll() as IDBRequest<CachedContent[]>)
    const expiredKeys = cached
      .sort((left, right) => right.savedAt - left.savedAt)
      .filter(
        (item, index) =>
          index >= config.contentCacheMaxItems ||
          Date.now() - item.savedAt > config.contentCacheMaxAgeDays * DAY_MS,
      )
      .map((item) => item.key)
    if (!expiredKeys.length) return
    const writeStore = database
      .transaction(CONTENT_CACHE_STORE, 'readwrite')
      .objectStore(CONTENT_CACHE_STORE)
    await Promise.all(expiredKeys.map((key) => requestToPromise(writeStore.delete(key))))
  } finally {
    database.close()
  }
}

export async function saveCachedContent(context: PageContext, captionLanguage = 'auto') {
  if (context.chunks.length === 0) return
  const database = await openDatabase()
  try {
    const config = await getUserConfig()
    const maxAge = config.contentCacheMaxAgeDays * DAY_MS
    const maxItems = config.contentCacheMaxItems
    const transaction = database.transaction(CONTENT_CACHE_STORE, 'readwrite')
    await requestToPromise(
      transaction.objectStore(CONTENT_CACHE_STORE).put({
        key: contentKey(context.url, captionLanguage),
        context,
        savedAt: Date.now(),
      } satisfies CachedContent),
    )
    const readTransaction = database.transaction(CONTENT_CACHE_STORE, 'readonly')
    const cached = await requestToPromise(
      readTransaction.objectStore(CONTENT_CACHE_STORE).getAll() as IDBRequest<CachedContent[]>,
    )
    const expiredKeys = cached
      .sort((left, right) => right.savedAt - left.savedAt)
      .filter((item, index) => index >= maxItems || Date.now() - item.savedAt > maxAge)
      .map((item) => item.key)
    if (expiredKeys.length) {
      const cleanup = database
        .transaction(CONTENT_CACHE_STORE, 'readwrite')
        .objectStore(CONTENT_CACHE_STORE)
      await Promise.all(expiredKeys.map((key) => requestToPromise(cleanup.delete(key))))
    }
  } finally {
    database.close()
  }
}
