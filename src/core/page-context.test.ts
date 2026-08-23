import { describe, expect, it } from 'vitest'
import {
  linkifyChunkCitations,
  multiPageContextToPrompt,
  PageContext,
  pageContextToPrompt,
  relevantContextChunks,
} from './page-context'

function context(chunks: string[]): PageContext {
  return {
    sourceType: 'webpage',
    url: 'https://example.com/article',
    title: 'Article',
    description: '',
    chunks: chunks.map((text, index) => ({
      id: `page-${index + 1}`,
      text,
      location: { type: 'dom', chunkId: `page-${index + 1}` },
    })),
    capturedAt: 1,
    extraction: {
      status: 'complete',
      processedUnits: chunks.length,
      totalUnits: chunks.length,
      truncated: false,
    },
  }
}

describe('relevantContextChunks', () => {
  it('uses the same keyword retrieval for long webpages', () => {
    const chunks = Array.from({ length: 30 }, (_, index) => `ordinary section ${index}`)
    chunks[15] = 'A distinctive platypus fact appears here.'

    const selected = relevantContextChunks(context(chunks), 'What does it say about platypus?')

    expect(selected.map((chunk) => chunk.id)).toEqual(['page-15', 'page-16', 'page-17'])
    expect(selected.length).toBeLessThanOrEqual(24)
  })

  it('evenly samples long content for whole-content summaries', () => {
    const page = context(Array.from({ length: 100 }, (_, index) => `section ${index}`))

    const selected = relevantContextChunks(page, '전체 내용을 요약해줘')

    expect(selected).toHaveLength(24)
    expect(selected[0].id).toBe('page-1')
    expect(selected.at(-1)?.id).toBe('page-100')
  })

  it('uses semantic scores when keyword terms do not match', () => {
    const page = context(Array.from({ length: 30 }, (_, index) => `section ${index}`))
    const vectors = page.chunks.map(() => [0, 1])
    vectors[20] = [1, 0]

    const selected = relevantContextChunks(page, 'unmatched query', {
      chunkVectors: vectors,
      queryVector: [1, 0],
    })

    expect(selected.map((chunk) => chunk.id)).toContain('page-21')
  })
})

describe('pageContextToPrompt', () => {
  it('always includes a pinned selection separately from ranked chunks', () => {
    const page = context(Array.from({ length: 30 }, (_, index) => `section ${index}`))
    const prompt = pageContextToPrompt(
      page,
      [{ id: 'question', role: 'user', content: 'unrelated question' }],
      'ko',
      undefined,
      'Exact paragraph selected by the user.',
    )

    expect(prompt).toContain('<pinned-selection>\nExact paragraph selected by the user.')
  })
})

describe('multiPageContextToPrompt', () => {
  it('namespaces citations and includes every selected source', () => {
    const first = context(['First source evidence'])
    const second = { ...context(['Second source evidence']), url: 'https://example.com/second' }
    const prompt = multiPageContextToPrompt(
      [first, second],
      [{ id: 'q', role: 'user', content: 'compare them' }],
      'en',
    )

    expect(prompt).toContain('[source-1:page-1] First source evidence')
    expect(prompt).toContain('[source-2:page-1] Second source evidence')
    expect(linkifyChunkCitations('[source-2:page-1]')).toBe(
      '[source-2:page-1](#pagemind-source-2:page-1)',
    )
  })

  it('uses compatible semantic rankings independently for each source', () => {
    const sources = [
      context(Array.from({ length: 30 }, (_, index) => `first ${index}`)),
      { ...context(Array.from({ length: 30 }, (_, index) => `second ${index}`)), url: 'second' },
    ]
    const vectors = sources.map((source, sourceIndex) =>
      source.chunks.map((_, chunkIndex) => (chunkIndex === 20 + sourceIndex ? [1, 0] : [0, 1])),
    )
    const prompt = multiPageContextToPrompt(
      sources,
      [{ id: 'q', role: 'user', content: 'unmatched' }],
      'en',
      undefined,
      vectors.map((chunkVectors) => ({ chunkVectors, queryVector: [1, 0] })),
    )

    expect(prompt).toContain('[source-1:page-21]')
    expect(prompt).toContain('[source-2:page-22]')
  })
})
