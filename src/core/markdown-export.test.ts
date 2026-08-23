import { describe, expect, it } from 'vitest'
import {
  createConversationMarkdown,
  createMultiSourceConversationMarkdown,
} from './markdown-export'
import { PageContext } from './page-context'

function baseContext(overrides: Partial<PageContext>): PageContext {
  return {
    sourceType: 'webpage',
    url: 'https://example.com/article',
    title: 'A: title / with "quotes"',
    description: '',
    chunks: [],
    capturedAt: 1,
    extraction: {
      status: 'complete',
      processedUnits: 1,
      totalUnits: 1,
      truncated: false,
    },
    ...overrides,
  }
}

describe('createConversationMarkdown', () => {
  it.each([
    {
      sourceType: 'webpage' as const,
      chunk: {
        id: 'page-1',
        text: 'Web text',
        location: { type: 'dom' as const, chunkId: 'page-1' },
      },
      link: '[page-1](https://example.com/article)',
    },
    {
      sourceType: 'youtube' as const,
      chunk: {
        id: 'yt-01:05',
        text: 'Video text',
        location: { type: 'youtube' as const, videoId: 'abc', seconds: 65, timestamp: '01:05' },
      },
      link: '[yt-01:05](https://www.youtube.com/watch?v=abc&t=65s)',
    },
    {
      sourceType: 'pdf' as const,
      chunk: { id: 'pdf-page-3', text: 'PDF text', location: { type: 'pdf' as const, page: 3 } },
      link: '[pdf-page-3](https://example.com/article#page=3)',
    },
  ])('links $sourceType citations', ({ sourceType, chunk, link }) => {
    const result = createConversationMarkdown(
      baseContext({ sourceType, chunks: [chunk] }),
      [{ id: 'answer', role: 'assistant', content: `Answer [${chunk.id}]` }],
      new Date('2026-08-16T00:00:00.000Z'),
    )

    expect(result.content).toContain(link)
    expect(result.filename).toBe('A- title - with -quotes-.md')
    expect(result.content).toContain('title: "A: title / with \\"quotes\\""')
  })
})

describe('multi-source Markdown export', () => {
  it('links namespaced citations to every selected source', () => {
    const primary = baseContext({
      chunks: [
        {
          id: 'page-1',
          text: 'Primary evidence',
          location: { type: 'dom', chunkId: 'page-1' },
        },
      ],
    })
    const second = {
      ...primary,
      url: 'https://example.com/second',
      title: 'Second',
      chunks: [
        {
          id: 'page-1',
          text: 'Second evidence',
          location: { type: 'dom' as const, chunkId: 'page-1' },
        },
      ],
    }
    const exported = createMultiSourceConversationMarkdown(
      [primary, second],
      [{ id: 'a', role: 'assistant', content: 'Compare [source-2:page-1]' }],
      new Date('2026-08-22T00:00:00Z'),
    )

    expect(exported.content).toContain('source_count: 2')
    expect(exported.content).toContain('[source-2:page-1](https://example.com/second)')
    expect(exported.content).toContain('Second evidence')
  })
})
