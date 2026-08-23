import { PageChunk, PageContext } from '@/core/page-context'
import { ContentExtractor } from './types'

const MAX_TRANSCRIPT_CHARS = 1000000

export interface CaptionTrack {
  baseUrl: string
  languageCode?: string
  kind?: string
  name?: { simpleText?: string; runs?: Array<{ text?: string }> }
}

interface TranscriptEvent {
  tStartMs: number
  segs: Array<{ utf8?: string }>
}

interface CaptionData {
  playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] }
}

function extractionError(code: string, message: string) {
  return { code, message }
}

function isYouTubeWatch(url: URL) {
  return (
    /(^|\.)youtube\.com$/.test(url.hostname) &&
    url.pathname === '/watch' &&
    url.searchParams.has('v')
  )
}

function objectAfter(source: string, marker: string) {
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) return
  const start = source.indexOf('{', markerIndex + marker.length)
  if (start < 0) return
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}' && --depth === 0) return source.slice(start, index + 1)
  }
}

export function selectCaptionTrack(tracks: CaptionTrack[], requestedLanguage?: string) {
  const preferred = (
    requestedLanguage && requestedLanguage !== 'auto' ? requestedLanguage : navigator.language
  ).toLowerCase()
  const matchesPreferredLanguage = (track: CaptionTrack) => {
    const language = track.languageCode?.toLowerCase()
    if (!language) return false
    return language === preferred || preferred.startsWith(`${language}-`)
  }
  return (
    tracks.find((track) => matchesPreferredLanguage(track) && track.kind !== 'asr') ||
    tracks.find(matchesPreferredLanguage) ||
    tracks.find((track) => track.kind !== 'asr') ||
    tracks[0]
  )
}

function trackLabel(track: CaptionTrack) {
  return (
    track.name?.simpleText ||
    track.name?.runs?.map((run) => run.text || '').join('') ||
    track.languageCode ||
    'Unknown'
  )
}

function timestamp(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = Math.floor(seconds % 60)
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

function transcriptChunks(events: TranscriptEvent[], videoId: string): PageChunk[] {
  const lines = events
    .filter((event) => Array.isArray(event.segs) && Number.isFinite(event.tStartMs))
    .map((event) => ({
      seconds: Math.floor(event.tStartMs / 1000),
      text: event.segs
        .map((segment) => segment.utf8 || '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    .filter((line) => line.text)

  const chunks: PageChunk[] = []
  let totalChars = 0
  for (let index = 0; index < lines.length && totalChars < MAX_TRANSCRIPT_CHARS; ) {
    const start = lines[index].seconds
    const parts: string[] = []
    while (
      index < lines.length &&
      parts.join(' ').length < 500 &&
      lines[index].seconds - start < 75
    ) {
      parts.push(lines[index].text)
      index += 1
    }
    const text = parts.join(' ').slice(0, MAX_TRANSCRIPT_CHARS - totalChars)
    const label = timestamp(start)
    chunks.push({
      id: `yt-${label}`,
      text,
      location: { type: 'youtube', videoId, seconds: start, timestamp: label },
    })
    totalChars += text.length
  }
  return chunks
}

function xmlTranscriptChunks(xml: string, videoId: string) {
  const document = new DOMParser().parseFromString(xml, 'text/xml')
  if (document.querySelector('parsererror')) return []
  const events = Array.from(document.querySelectorAll('p, text')).map((node) => {
    const milliseconds =
      node.tagName === 'p'
        ? Number(node.getAttribute('t') || 0)
        : Number(node.getAttribute('start') || 0) * 1000
    return {
      tStartMs: milliseconds,
      segs: [{ utf8: node.textContent || '' }],
    }
  })
  return transcriptChunks(events, videoId)
}

export function parseYouTubeTranscript(body: string, videoId: string) {
  const content = body.trim()
  if (!content) return []
  if (content.startsWith('{')) {
    try {
      const transcript = JSON.parse(content)
      return transcriptChunks(transcript.events || [], videoId)
    } catch {
      return []
    }
  }
  return xmlTranscriptChunks(content, videoId)
}

function secondsFromTimestamp(value: string) {
  return value
    .trim()
    .split(':')
    .reduce((total, part) => total * 60 + Number(part), 0)
}

function querySelectorAllDeep<E extends Element>(selector: string, root: ParentNode = document) {
  const matches: E[] = []
  const visit = (current: ParentNode) => {
    matches.push(...Array.from(current.querySelectorAll<E>(selector)))
    current.querySelectorAll<HTMLElement>('*').forEach((element) => {
      if (element.shadowRoot) visit(element.shadowRoot)
    })
  }
  visit(root)
  return matches
}

function querySelectorDeep<E extends Element>(selector: string, root: ParentNode) {
  return querySelectorAllDeep<E>(selector, root)[0] || null
}

function transcriptFromPage(videoId: string) {
  const rows = querySelectorAllDeep<HTMLElement>(
    'ytd-transcript-segment-renderer, yt-transcript-segment-view-model, transcript-segment-view-model',
  )
  const events = rows
    .map((row) => {
      const timestampElement = querySelectorDeep<HTMLElement>(
        '.segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp, [class*="Timestamp"]',
        row,
      )
      const textElement = querySelectorDeep<HTMLElement>(
        '.segment-text, [class*="segment-text"], [role="text"]',
        row,
      )
      const timestampText = timestampElement?.textContent?.trim() || ''
      const text = textElement?.textContent?.replace(/\s+/g, ' ').trim() || ''
      return {
        tStartMs: secondsFromTimestamp(timestampText) * 1000,
        segs: [{ utf8: text }],
      }
    })
    .filter((event) => Number.isFinite(event.tStartMs) && event.segs[0].utf8)
  return transcriptChunks(events, videoId)
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function transcriptFromYouTubePanel(videoId: string, preferredTrack?: CaptionTrack) {
  let chunks = transcriptFromPage(videoId)
  if (chunks.length && !preferredTrack) return chunks
  const existingChunks = chunks

  if (!existingChunks.length) {
    const expand = document.querySelector<HTMLElement>(
      'ytd-watch-metadata #description-inline-expander #expand, ytd-watch-metadata #expand',
    )
    expand?.click()

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const transcriptSection = document.querySelector<HTMLElement>(
        'ytd-video-description-transcript-section-renderer',
      )
      const transcriptButton = transcriptSection?.querySelector<HTMLElement>(
        'button, tp-yt-paper-button, yt-button-shape button',
      )
      if (transcriptButton) {
        transcriptButton.click()
        break
      }
      await wait(200)
    }
  }

  if (preferredTrack) {
    let languageControl: HTMLElement | null = null
    for (let attempt = 0; attempt < 10 && !languageControl; attempt += 1) {
      languageControl = document.querySelector<HTMLElement>(
        'ytd-transcript-footer-renderer tp-yt-paper-dropdown-menu, ytd-transcript-footer-renderer button, yt-transcript-footer-view-model button, [target-id="engagement-panel-searchable-transcript"] [aria-haspopup="listbox"]',
      )
      if (!languageControl) await wait(200)
    }
    languageControl?.click()
    if (languageControl) {
      await wait(250)
      const expected = trackLabel(preferredTrack).toLocaleLowerCase()
      const options = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="option"], tp-yt-paper-listbox tp-yt-paper-item, ytd-menu-service-item-renderer, yt-list-item-view-model',
        ),
      )
      const option = options.find((item) => {
        const label = item.textContent?.replace(/\s+/g, ' ').trim().toLocaleLowerCase() || ''
        return label === expected || label.includes(expected)
      })
      option?.click()
      if (option) await wait(600)
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(200)
    chunks = transcriptFromPage(videoId)
    if (chunks.length) return chunks
  }
  return existingChunks
}

async function downloadTranscript(baseUrl: string, videoId: string) {
  const jsonUrl = new URL(baseUrl)
  jsonUrl.searchParams.set('fmt', 'json3')

  for (const url of [jsonUrl.toString(), baseUrl]) {
    const response = await fetch(url)
    if (!response.ok) continue
    const chunks = parseYouTubeTranscript(await response.text(), videoId)
    if (chunks.length) return chunks
  }
  return []
}

async function fetchTranscript(videoId: string, requestedLanguage?: string) {
  const response = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`)
  if (!response.ok) throw new Error('YouTube 페이지를 불러오지 못했습니다.')
  const html = await response.text()
  const rawCaptions = objectAfter(html, '"captions":')
  if (!rawCaptions) {
    const chunks = await transcriptFromYouTubePanel(videoId)
    return {
      chunks,
      captions: [],
      captionLanguage: undefined,
      error: chunks.length
        ? undefined
        : extractionError('YOUTUBE_CAPTIONS_UNAVAILABLE', 'This video has no accessible captions.'),
    }
  }
  let captions: CaptionData
  try {
    captions = JSON.parse(rawCaptions) as CaptionData
  } catch {
    const chunks = await transcriptFromYouTubePanel(videoId)
    return {
      chunks,
      captions: [],
      captionLanguage: undefined,
      error: chunks.length
        ? undefined
        : extractionError(
            'YOUTUBE_TRANSCRIPT_EXTRACTION_FAILED',
            'YouTube captions were found, but their metadata could not be read.',
          ),
    }
  }
  const tracks = captions.playerCaptionsTracklistRenderer?.captionTracks
  const track = tracks?.length ? selectCaptionTrack(tracks, requestedLanguage) : undefined
  const captionOptions = (tracks || []).map((candidate) => ({
    languageCode: candidate.languageCode || '',
    label: trackLabel(candidate),
    automatic: candidate.kind === 'asr',
  }))
  if (!track?.baseUrl) {
    const chunks = await transcriptFromYouTubePanel(videoId, track)
    return {
      chunks,
      captions: captionOptions,
      captionLanguage: track?.languageCode,
      error: chunks.length
        ? undefined
        : extractionError('YOUTUBE_CAPTIONS_UNAVAILABLE', 'This video has no accessible captions.'),
    }
  }
  const downloaded = await downloadTranscript(track.baseUrl, videoId)
  const chunks = downloaded.length ? downloaded : await transcriptFromYouTubePanel(videoId, track)
  return {
    chunks,
    captions: captionOptions,
    captionLanguage: track.languageCode,
    error: chunks.length
      ? undefined
      : extractionError(
          'YOUTUBE_TRANSCRIPT_EXTRACTION_FAILED',
          'Captions are listed for this video, but PageMind could not extract them.',
        ),
  }
}

export const youtubeExtractor: ContentExtractor = {
  sourceType: 'youtube',
  canExtract: isYouTubeWatch,
  async extract(options): Promise<PageContext> {
    const url = new URL(location.href)
    const videoId = url.searchParams.get('v') || ''
    const transcript = await fetchTranscript(videoId, options?.captionLanguage)
    return {
      sourceType: 'youtube',
      url: location.href,
      title:
        document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
        document.title.replace(/\s*-\s*YouTube$/, ''),
      description:
        document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      chunks: transcript.chunks,
      capturedAt: Date.now(),
      extraction: {
        status: transcript.error ? 'failed' : 'complete',
        processedUnits: transcript.chunks.length,
        totalUnits: transcript.chunks.length,
        truncated: false,
        error: transcript.error,
      },
      captions: transcript.captions,
      captionLanguage: transcript.captionLanguage,
    }
  },
  navigateTo(chunk) {
    if (chunk.location.type !== 'youtube') return false
    const video = document.querySelector<HTMLVideoElement>('video')
    if (!video) return false
    video.currentTime = chunk.location.seconds
    video.play().catch(() => {})
    video.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return true
  },
}
