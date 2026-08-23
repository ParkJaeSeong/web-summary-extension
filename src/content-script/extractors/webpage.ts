import { PageChunk, PageContext } from '@/core/page-context'
import { ContentExtractor } from './types'

const MAX_CONTEXT_CHARS = 24000
const MIN_CHUNK_CHARS = 40

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function extractChunks(sourceDocument: Document): PageChunk[] {
  const root = sourceDocument.querySelector('article, main, [role="main"]') || sourceDocument.body
  const nodes = root.querySelectorAll('h1, h2, h3, p, li, blockquote, pre')
  const chunks: PageChunk[] = []
  let totalChars = 0

  sourceDocument.querySelectorAll('[data-pagemind-chunk-id]').forEach((element) => {
    element.removeAttribute('data-pagemind-chunk-id')
  })

  for (const node of Array.from(nodes)) {
    const text = normalizeText(node.textContent || '')
    if (text.length < MIN_CHUNK_CHARS) continue
    if (totalChars + text.length > MAX_CONTEXT_CHARS) break
    const id = `page-${chunks.length + 1}`
    node.setAttribute('data-pagemind-chunk-id', id)
    chunks.push({ id, text, location: { type: 'dom', chunkId: id } })
    totalChars += text.length
  }

  if (chunks.length === 0) {
    const text = normalizeText(root.textContent || '').slice(0, MAX_CONTEXT_CHARS)
    if (text) {
      root.setAttribute('data-pagemind-chunk-id', 'page-1')
      chunks.push({ id: 'page-1', text, location: { type: 'dom', chunkId: 'page-1' } })
    }
  }
  return chunks
}

function embeddedMainFrameDocument() {
  return document.querySelector<HTMLIFrameElement>('iframe#mainFrame')?.contentDocument || null
}

async function readableDocument() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const frameDocument = embeddedMainFrameDocument()
    if (frameDocument?.body?.textContent?.trim()) return frameDocument
    if (!document.querySelector('iframe#mainFrame')) break
    await new Promise((resolve) => window.setTimeout(resolve, 100))
  }
  return document
}

export const webpageExtractor: ContentExtractor = {
  sourceType: 'webpage',
  canExtract: () => true,
  async extract(): Promise<PageContext> {
    const sourceDocument = await readableDocument()
    const chunks = extractChunks(sourceDocument)
    return {
      sourceType: 'webpage',
      url: location.href,
      title: document.title,
      description:
        document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      chunks,
      capturedAt: Date.now(),
      extraction: {
        status: 'complete',
        processedUnits: chunks.length,
        totalUnits: chunks.length,
        truncated: false,
      },
    }
  },
  navigateTo(chunk) {
    if (chunk.location.type !== 'dom') return false
    const selector = `[data-pagemind-chunk-id="${chunk.location.chunkId}"]`
    const element =
      document.querySelector<HTMLElement>(selector) ||
      embeddedMainFrameDocument()?.querySelector<HTMLElement>(selector)
    if (!element) return false
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element.animate(
      [
        { backgroundColor: 'rgba(250, 204, 21, 0)', outlineColor: 'rgba(250, 204, 21, 0)' },
        { backgroundColor: 'rgba(250, 204, 21, 0.3)', outlineColor: 'rgba(202, 138, 4, 0.9)' },
        { backgroundColor: 'rgba(250, 204, 21, 0)', outlineColor: 'rgba(250, 204, 21, 0)' },
      ],
      { duration: 2200, easing: 'ease-in-out' },
    )
    return true
  },
}
