import { describe, expect, it } from 'vitest'
import { normalizePinnedSelection } from './chat-session'

describe('pinned selections', () => {
  it('normalizes whitespace and bounds content sent to a provider', () => {
    const selection = normalizePinnedSelection({
      text: `  selected\n\ntext ${'x'.repeat(7000)}  `,
      url: 'https://example.com/article',
      createdAt: 1,
    })

    expect(selection.text.startsWith('selected text')).toBe(true)
    expect(selection.text).toHaveLength(6000)
  })
})
