import Browser from 'webextension-polyfill'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageContext } from '@/core/page-context'
import { DATABASE_NAME } from './database'
import {
  getCachedContent,
  getCachedContentByKey,
  getContentCacheStats,
  deleteCachedContent,
  deleteCachedContentEmbeddings,
  hasCurrentEmbeddings,
  listCachedContent,
  pruneContentCache,
  saveCachedContent,
  saveContentEmbeddings,
} from './content-cache'

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

const webpage: PageContext = {
  sourceType: 'webpage',
  url: 'https://example.com/article#section',
  title: 'Article',
  description: '',
  chunks: [
    { id: 'page-1', text: 'Locally cached text', location: { type: 'dom', chunkId: 'page-1' } },
  ],
  capturedAt: 1,
  extraction: { status: 'complete', processedUnits: 1, totalUnits: 1, truncated: false },
}

describe('content cache', () => {
  beforeEach(async () => {
    await deleteDatabase()
    await Browser.storage.local.set({ contentCacheMaxAgeDays: 30, contentCacheMaxItems: 50 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stores and reuses webpage context and embeddings', async () => {
    await saveCachedContent(webpage)
    await saveContentEmbeddings(webpage.url, { model: 'test-model', vectors: [[1, 0]] })

    const cached = await getCachedContent('https://example.com/article#another-section')
    const stats = await getContentCacheStats()

    expect(cached?.context.title).toBe('Article')
    expect(cached?.embeddings).toEqual({ model: 'test-model', vectors: [[1, 0]] })
    expect(stats).toMatchObject({ documents: 1, contentChunks: 1, embeddedChunks: 1 })
  })

  it('does not return content after its configured expiry', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(new Date('2026-01-01T00:00:00Z').getTime())
    await Browser.storage.local.set({ contentCacheMaxAgeDays: 1 })
    await saveCachedContent(webpage)

    now.mockReturnValue(new Date('2026-01-03T00:00:00Z').getTime())

    await expect(getCachedContent(webpage.url)).resolves.toBeUndefined()
  })

  it('lists cache metadata and deletes embeddings independently from content', async () => {
    await saveCachedContent(webpage)
    await saveContentEmbeddings(webpage.url, { model: 'test-model', vectors: [[1, 0]] })

    expect(await listCachedContent()).toMatchObject([
      {
        title: 'Article',
        sourceType: 'webpage',
        chunks: 1,
        vectorBytes: 16,
        embeddingModel: 'test-model',
      },
    ])

    const [item] = await listCachedContent()
    expect((await getCachedContentByKey(item.key))?.context.title).toBe('Article')
    await deleteCachedContentEmbeddings(item.key)
    expect((await getCachedContent(webpage.url))?.embeddings).toBeUndefined()
    await deleteCachedContent(item.key)
    expect(await listCachedContent()).toEqual([])
  })

  it('prunes the oldest items when the configured item limit shrinks', async () => {
    const now = vi.spyOn(Date, 'now')
    await Browser.storage.local.set({ contentCacheMaxItems: 3 })
    for (let index = 1; index <= 3; index += 1) {
      now.mockReturnValue(new Date(`2026-01-0${index}T00:00:00Z`).getTime())
      await saveCachedContent({ ...webpage, url: `https://example.com/${index}` })
    }
    await Browser.storage.local.set({ contentCacheMaxItems: 2 })

    await pruneContentCache()

    await expect(getCachedContent('https://example.com/1')).resolves.toBeUndefined()
    await expect(getCachedContent('https://example.com/2')).resolves.toBeDefined()
    await expect(getCachedContent('https://example.com/3')).resolves.toBeDefined()
  })

  it('keeps cache statistics bounded and readable at the configured item limit', async () => {
    await Browser.storage.local.set({ contentCacheMaxItems: 50 })
    for (let index = 0; index < 55; index += 1) {
      await saveCachedContent({
        ...webpage,
        url: `https://example.com/limit/${index}`,
        title: `Article ${index}`,
      })
    }

    const items = await listCachedContent()
    const stats = await getContentCacheStats()

    expect(items).toHaveLength(50)
    expect(stats).toMatchObject({ documents: 50, contentChunks: 50 })
  })

  it('requires re-indexing when the embedding model or chunk count changes', () => {
    const embeddings = { model: 'model-a', vectors: [[1, 0]] }

    expect(hasCurrentEmbeddings(webpage, embeddings, 'model-a')).toBe(true)
    expect(hasCurrentEmbeddings(webpage, embeddings, 'model-b')).toBe(false)
    expect(
      hasCurrentEmbeddings(
        { ...webpage, chunks: [...webpage.chunks, { ...webpage.chunks[0], id: 'page-2' }] },
        embeddings,
        'model-a',
      ),
    ).toBe(false)
  })
})
