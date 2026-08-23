import { beforeEach, describe, expect, it, vi } from 'vitest'
import { structuredWebpage } from '@/test/fixtures/content'
import { webpageExtractor } from './webpage'

describe('webpageExtractor', () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<title>Fixture article</title><meta name="description" content="Summary">'
    document.body.innerHTML = ''
  })

  it('prefers structured main content over surrounding chrome', async () => {
    document.body.innerHTML = structuredWebpage

    const context = await webpageExtractor.extract()

    expect(context.title).toBe('Fixture article')
    expect(context.description).toBe('Summary')
    expect(context.chunks.map((chunk) => chunk.text).join(' ')).toContain('Important article')
    expect(context.chunks.map((chunk) => chunk.text).join(' ')).not.toContain('Navigation content')
  })

  it('falls back to readable root text when no structured nodes qualify', async () => {
    document.body.innerHTML = '<div>Short but useful fallback text.</div>'

    const context = await webpageExtractor.extract()

    expect(context.chunks).toHaveLength(1)
    expect(context.chunks[0].text).toBe('Short but useful fallback text.')
  })

  it('extracts a Naver blog post from its mainFrame document', async () => {
    window.history.replaceState({}, '', '/writer/post-id')
    const frame = document.createElement('iframe')
    frame.id = 'mainFrame'
    document.body.append(frame)
    frame.contentDocument!.body.innerHTML = `
      <main><p>${'Naver blog article body '.repeat(3)}</p></main>
    `

    const context = await webpageExtractor.extract()

    expect(context.chunks).toHaveLength(1)
    expect(context.chunks[0].text).toContain('Naver blog article body')
    expect(frame.contentDocument!.querySelector('[data-pagemind-chunk-id="page-1"]')).not.toBeNull()
  })

  it('enforces the content limit without creating partial chunks', async () => {
    document.body.innerHTML = `<main>${Array.from(
      { length: 30 },
      (_, index) => `<p>${index}-${'x'.repeat(995)}</p>`,
    ).join('')}</main>`

    const context = await webpageExtractor.extract()

    expect(
      context.chunks.reduce((total, chunk) => total + chunk.text.length, 0),
    ).toBeLessThanOrEqual(24000)
    expect(
      context.chunks.every((chunk) => chunk.text.length === 997 || chunk.text.length === 998),
    ).toBe(true)
  })

  it('navigates to the DOM node represented by a citation', async () => {
    document.body.innerHTML = structuredWebpage
    const context = await webpageExtractor.extract()
    const target = document.querySelector<HTMLElement>('[data-pagemind-chunk-id="page-1"]')!
    target.scrollIntoView = vi.fn()
    target.animate = vi.fn() as unknown as typeof target.animate

    expect(webpageExtractor.navigateTo(context.chunks[0])).toBe(true)
    expect(target.scrollIntoView).toHaveBeenCalled()
    expect(target.animate).toHaveBeenCalled()
  })
})
