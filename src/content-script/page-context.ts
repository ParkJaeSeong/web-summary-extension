import { PageContext } from '@/core/page-context'
import { ContentExtractor } from './extractors/types'
import { webpageExtractor } from './extractors/webpage'
import { youtubeExtractor } from './extractors/youtube'

const extractors: ContentExtractor[] = [youtubeExtractor, webpageExtractor]
let activeExtractor: ContentExtractor = webpageExtractor
let lastContext: PageContext | undefined

export async function capturePageContext(options?: { captionLanguage?: string }) {
  const url = new URL(location.href)
  activeExtractor = extractors.find((extractor) => extractor.canExtract(url)) || webpageExtractor
  lastContext = await activeExtractor.extract(options)
  return lastContext
}

export function scrollToPageChunk(chunkId: string) {
  const chunk = lastContext?.chunks.find((candidate) => candidate.id === chunkId)
  return chunk ? activeExtractor.navigateTo(chunk) : false
}
