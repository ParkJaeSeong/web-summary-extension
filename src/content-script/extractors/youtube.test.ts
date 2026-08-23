import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { youtubeJson3, youtubeXml } from '@/test/fixtures/content'
import {
  CaptionTrack,
  parseYouTubeTranscript,
  selectCaptionTrack,
  youtubeExtractor,
} from './youtube'

describe('YouTube captions', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('parses JSON3 captions into timestamped chunks', () => {
    const chunks = parseYouTubeTranscript(youtubeJson3, 'video-id')

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({
      id: 'yt-00:00',
      text: 'First caption. Second caption.',
      location: { type: 'youtube', videoId: 'video-id', seconds: 0 },
    })
    expect(chunks[1].id).toBe('yt-01:20')
  })

  it('parses XML captions', () => {
    const chunks = parseYouTubeTranscript(youtubeXml, 'video-id')

    expect(chunks.map((chunk) => chunk.id)).toEqual(['yt-00:01', 'yt-01:20'])
    expect(chunks[0].text).toBe('XML first caption.')
  })

  it('chunks a synthetic two-hour automatic transcript within content limits', () => {
    const events = Array.from({ length: 7_201 }, (_, second) => ({
      tStartMs: second * 1000,
      segs: [{ utf8: `caption ${second}` }],
    }))

    const chunks = parseYouTubeTranscript(JSON.stringify({ events }), 'long-video')

    expect(chunks.length).toBeGreaterThan(100)
    expect(chunks.at(-1)?.location).toMatchObject({
      type: 'youtube',
      videoId: 'long-video',
    })
    expect(chunks.reduce((total, chunk) => total + chunk.text.length, 0)).toBeLessThanOrEqual(
      1_000_000,
    )
  })

  it('prefers a manual requested language and falls back to automatic captions', () => {
    const tracks: CaptionTrack[] = [
      { baseUrl: 'auto-ko', languageCode: 'ko', kind: 'asr' },
      { baseUrl: 'manual-ko', languageCode: 'ko' },
      { baseUrl: 'manual-en', languageCode: 'en' },
    ]

    expect(selectCaptionTrack(tracks, 'ko')?.baseUrl).toBe('manual-ko')
    expect(
      selectCaptionTrack([{ baseUrl: 'auto-ko', languageCode: 'ko', kind: 'asr' }], 'ko')?.baseUrl,
    ).toBe('auto-ko')
    expect(
      selectCaptionTrack(
        [
          { baseUrl: 'manual-en', languageCode: 'en' },
          { baseUrl: 'auto-ko', languageCode: 'ko', kind: 'asr' },
        ],
        'ko-KR',
      )?.baseUrl,
    ).toBe('auto-ko')
  })

  it.each([
    { kind: undefined, automatic: false },
    { kind: 'asr', automatic: true },
  ])('extracts a downloaded caption track with kind $kind', async ({ kind, automatic }) => {
    const track = {
      baseUrl: 'https://captions.test/track',
      languageCode: 'ko',
      ...(kind ? { kind } : {}),
    }
    const watchHtml = `<script>var player={"captions":${JSON.stringify({
      playerCaptionsTracklistRenderer: { captionTracks: [track] },
    })},"next":true}</script>`
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      return new Response(url.includes('youtube.com/watch') ? watchHtml : youtubeJson3, {
        status: 200,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const context = await youtubeExtractor.extract({ captionLanguage: 'ko' })

    expect(context.chunks[0].text).toContain('First caption')
    expect(context.captionLanguage).toBe('ko')
    expect(context.captions).toEqual([expect.objectContaining({ languageCode: 'ko', automatic })])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to the rendered transcript panel', async () => {
    document.body.innerHTML = `
      <ytd-transcript-segment-renderer>
        <span class="segment-timestamp">0:42</span>
        <span class="segment-text">Rendered panel caption</span>
      </ytd-transcript-segment-renderer>
    `
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>no caption metadata</html>', { status: 200 })),
    )

    const context = await youtubeExtractor.extract()

    expect(context.chunks[0]).toMatchObject({
      id: 'yt-00:42',
      text: 'Rendered panel caption',
    })
    expect(context.extraction.status).toBe('complete')
  })

  it('reads captions from the current transcript components inside shadow DOM', async () => {
    const transcriptHost = document.createElement('div')
    const transcriptRoot = transcriptHost.attachShadow({ mode: 'open' })
    transcriptRoot.innerHTML = `
      <transcript-segment-view-model>
        <div class="ytwTranscriptSegmentViewModelTimestamp">1:05</div>
        <span role="text">Modern shadow DOM caption</span>
      </transcript-segment-view-model>
    `
    document.body.append(transcriptHost)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>no caption metadata</html>', { status: 200 })),
    )

    const context = await youtubeExtractor.extract()

    expect(context.chunks[0]).toMatchObject({
      id: 'yt-01:05',
      text: 'Modern shadow DOM caption',
      location: { seconds: 65 },
    })
    expect(context.extraction.status).toBe('complete')
  })

  it('distinguishes unavailable captions from extraction failure', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('youtube.com/watch')) {
        return new Response('<html>no caption metadata</html>', { status: 200 })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const unavailablePromise = youtubeExtractor.extract()
    await vi.advanceTimersByTimeAsync(10_000)
    const unavailable = await unavailablePromise

    expect(unavailable.extraction).toMatchObject({
      status: 'failed',
      error: { code: 'YOUTUBE_CAPTIONS_UNAVAILABLE' },
    })

    const track = { baseUrl: 'https://captions.test/track', languageCode: 'en' }
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input)
      return url.includes('youtube.com/watch')
        ? new Response(
            `<script>var player={"captions":${JSON.stringify({
              playerCaptionsTracklistRenderer: { captionTracks: [track] },
            })},"next":true}</script>`,
            { status: 200 },
          )
        : new Response('', { status: 404 })
    })

    const failedPromise = youtubeExtractor.extract()
    await vi.advanceTimersByTimeAsync(10_000)
    const failed = await failedPromise

    expect(failed.extraction).toMatchObject({
      status: 'failed',
      error: { code: 'YOUTUBE_TRANSCRIPT_EXTRACTION_FAILED' },
    })
  })

  it('navigates a timestamp citation in the current video', () => {
    document.body.innerHTML = '<video></video>'
    const video = document.querySelector('video')!
    video.play = vi.fn().mockResolvedValue(undefined)
    video.scrollIntoView = vi.fn()

    const found = youtubeExtractor.navigateTo({
      id: 'yt-01:05',
      text: 'Caption',
      location: { type: 'youtube', videoId: 'video-id', seconds: 65, timestamp: '01:05' },
    })

    expect(found).toBe(true)
    expect(video.currentTime).toBe(65)
    expect(video.play).toHaveBeenCalled()
    expect(video.scrollIntoView).toHaveBeenCalled()
  })
})
