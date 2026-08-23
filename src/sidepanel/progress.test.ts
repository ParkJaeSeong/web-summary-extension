import { describe, expect, it } from 'vitest'
import { contentLoadStage, embeddingBatches } from './progress'

describe('side-panel progress', () => {
  it.each([
    ['https://example.com/article', 'page'],
    ['https://www.youtube.com/watch?v=video', 'youtube'],
    ['https://papers.example.com/report.PDF?download=1', 'pdf'],
    ['chrome://settings', 'page'],
  ])('selects the load stage for %s', (url, expected) => {
    expect(contentLoadStage(url)).toBe(expected)
  })

  it('splits embedding work into bounded batches with exact progress endpoints', () => {
    expect(embeddingBatches(130)).toEqual([
      { start: 0, end: 64 },
      { start: 64, end: 128 },
      { start: 128, end: 130 },
    ])
  })
})
