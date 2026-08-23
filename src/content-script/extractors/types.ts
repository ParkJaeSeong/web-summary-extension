import { ContentAdapter } from '@/core/content-adapter'
import { PageChunk, PageContext } from '@/core/page-context'

export interface ContentExtractor extends ContentAdapter {
  extract(options?: { captionLanguage?: string }): Promise<PageContext>
  navigateTo(chunk: PageChunk): boolean
}
