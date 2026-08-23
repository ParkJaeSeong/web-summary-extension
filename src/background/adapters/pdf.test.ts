import { describe, expect, it } from 'vitest'
import { pdfFallbackTitle } from './pdf'

describe('pdfFallbackTitle', () => {
  it('decodes a URL filename when PDF metadata has no title', () => {
    expect(pdfFallbackTitle('https://example.com/reports/Page%20Mind.pdf')).toBe('Page Mind.pdf')
  })

  it('keeps malformed percent encoding instead of failing extraction', () => {
    expect(pdfFallbackTitle('https://example.com/bad%title.pdf')).toBe('bad%title.pdf')
  })
})
