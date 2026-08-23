import { describe, expect, it } from 'vitest'
import { pageAccessKind } from './page-access'

describe('page access classification', () => {
  it.each(['chrome://extensions', 'edge://settings', 'about:blank', 'data:text/plain,test'])(
    'blocks protected browser URL %s',
    (url) => expect(pageAccessKind(url)).toBe('restricted'),
  )

  it.each([
    'https://chromewebstore.google.com/detail/example/id',
    'https://chrome.google.com/webstore/detail/example/id',
  ])('blocks Chrome Web Store URL %s', (url) => expect(pageAccessKind(url)).toBe('restricted'))

  it('distinguishes local files from ordinary webpages', () => {
    expect(pageAccessKind('file:///Users/example/document.pdf')).toBe('file')
    expect(pageAccessKind('https://example.com/article')).toBe('web')
  })
})
