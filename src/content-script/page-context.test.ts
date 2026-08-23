import { afterEach, describe, expect, it, vi } from 'vitest'
import { youtubeJson3 } from '@/test/fixtures/content'
import { capturePageContext, scrollToPageChunk } from './page-context'

function watchHtml(videoId: string) {
  return `<script>var player={"captions":${JSON.stringify({
    playerCaptionsTracklistRenderer: {
      captionTracks: [{ baseUrl: `https://captions.test/${videoId}`, languageCode: 'en' }],
    },
  })},"next":true}</script>`
}

describe('content context navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('replaces the previous YouTube context after an SPA video change', async () => {
    document.body.innerHTML = '<video></video>'
    const video = document.querySelector('video')!
    video.play = vi.fn().mockResolvedValue(undefined)
    video.scrollIntoView = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.includes('youtube.com/watch')) {
          const videoId = new URL(url).searchParams.get('v') || ''
          return new Response(watchHtml(videoId), { status: 200 })
        }
        const body = url.includes('/second')
          ? JSON.stringify({ events: [{ tStartMs: 80_000, segs: [{ utf8: 'Second video' }] }] })
          : youtubeJson3
        return new Response(body, { status: 200 })
      }),
    )

    history.replaceState({}, '', '/watch?v=first')
    await capturePageContext()
    expect(scrollToPageChunk('yt-00:00')).toBe(true)

    history.replaceState({}, '', '/watch?v=second')
    const second = await capturePageContext()

    expect(second.chunks[0].id).toBe('yt-01:20')
    expect(scrollToPageChunk('yt-00:00')).toBe(false)
    expect(scrollToPageChunk('yt-01:20')).toBe(true)
  })
})
