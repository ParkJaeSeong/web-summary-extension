import { afterEach, describe, expect, it, vi } from 'vitest'
import { textlessPdfFixture, textPdfFixture } from '@/test/fixtures/pdf'
import { downloadPdf, extractPdfDocument, parsePdf } from './pdf-parser'

function respond(body: BodyInit, headers?: HeadersInit) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200, headers })))
}

describe('PDF parser', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('extracts text, preserves page numbers across blanks, and reads metadata', async () => {
    respond(textPdfFixture())

    const result = await parsePdf('https://example.com/fixture.pdf')

    expect(result).toMatchObject({
      title: 'Fixture PDF',
      totalPages: 3,
      processedPages: 3,
      truncated: false,
    })
    expect(result.pages).toEqual([
      { page: 1, text: 'First page text' },
      { page: 3, text: 'Third page text' },
    ])
  })

  it('reports truncation when the configured page limit is reached', async () => {
    respond(textPdfFixture())

    const result = await parsePdf('https://example.com/fixture.pdf', {
      maxBytes: 100_000,
      maxCharacters: 100_000,
      maxPages: 1,
    })

    expect(result.processedPages).toBe(1)
    expect(result.totalPages).toBe(3)
    expect(result.truncated).toBe(true)
  })

  it('rejects non-PDF responses', async () => {
    respond('not a pdf')

    await expect(downloadPdf('https://example.com/not-pdf')).rejects.toThrow('not a readable PDF')
  })

  it('rejects oversized responses before downloading the body', async () => {
    respond('%PDF-1.4', { 'content-length': '101' })

    await expect(downloadPdf('https://example.com/large.pdf', 100)).rejects.toThrow(
      'larger than the 100 byte limit',
    )
  })

  it('rejects malformed PDF data', async () => {
    respond('%PDF-1.4\nmalformed')

    await expect(parsePdf('https://example.com/malformed.pdf')).rejects.toThrow()
  })

  it('reports textless PDFs as requiring OCR', async () => {
    respond(textlessPdfFixture())

    await expect(parsePdf('https://example.com/scanned.pdf')).rejects.toThrow('may require OCR')
  })

  it('cleans up pages and destroys the document after extraction', async () => {
    const cleanup = vi.fn()
    const destroy = vi.fn().mockResolvedValue(undefined)
    const pdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'Lifecycle text' }] }),
        cleanup,
      }),
      getMetadata: vi.fn().mockResolvedValue({ info: {} }),
      destroy,
    } as unknown as Parameters<typeof extractPdfDocument>[0]

    await extractPdfDocument(pdf)

    expect(cleanup).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('cleans up resources when page extraction fails', async () => {
    const cleanup = vi.fn()
    const destroy = vi.fn().mockResolvedValue(undefined)
    const pdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockRejectedValue(new Error('page failed')),
        cleanup,
      }),
      getMetadata: vi.fn(),
      destroy,
    } as unknown as Parameters<typeof extractPdfDocument>[0]

    await expect(extractPdfDocument(pdf)).rejects.toThrow('page failed')
    expect(cleanup).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('reports page-by-page parsing and finishing progress', async () => {
    const progress = vi.fn()
    respond(textPdfFixture())

    await parsePdf('https://example.com/fixture.pdf', undefined, { onProgress: progress })

    expect(progress.mock.calls).toEqual(
      expect.arrayContaining([
        ['downloading', 0, 0],
        ['parsing', 0, 3],
        ['parsing', 1, 3],
        ['parsing', 2, 3],
        ['parsing', 3, 3],
        ['finishing', 3, 3],
      ]),
    )
  })

  it('stops before the next page and destroys the document when cancelled', async () => {
    const controller = new AbortController()
    const cleanup = vi.fn()
    const destroy = vi.fn().mockResolvedValue(undefined)
    const getPage = vi.fn().mockResolvedValue({
      getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'Page text' }] }),
      cleanup,
    })
    const pdf = {
      numPages: 3,
      getPage,
      getMetadata: vi.fn().mockResolvedValue({ info: {} }),
      destroy,
    } as unknown as Parameters<typeof extractPdfDocument>[0]

    const result = extractPdfDocument(pdf, undefined, {
      signal: controller.signal,
      onProgress(stage, completed) {
        if (stage === 'parsing' && completed === 1) controller.abort()
      },
    })

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(getPage).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('processes a 300-page text document while yielding between page groups', async () => {
    const cleanup = vi.fn()
    const destroy = vi.fn().mockResolvedValue(undefined)
    const pdf = {
      numPages: 300,
      getPage: vi.fn(async (page: number) => ({
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: `Page ${page}` }] }),
        cleanup,
      })),
      getMetadata: vi.fn().mockResolvedValue({ info: {} }),
      destroy,
    } as unknown as Parameters<typeof extractPdfDocument>[0]

    const result = await extractPdfDocument(pdf)

    expect(result).toMatchObject({ processedPages: 300, totalPages: 300, truncated: false })
    expect(result.pages).toHaveLength(300)
    expect(cleanup).toHaveBeenCalledTimes(300)
    expect(destroy).toHaveBeenCalledOnce()
  })
})
