import { PageContext, PageSourceType } from './page-context'

export interface ContentExtractionOptions {
  captionLanguage?: string
}

export interface ContentAdapter<Options = ContentExtractionOptions> {
  sourceType: PageSourceType
  canExtract(url: URL): boolean
  extract(options?: Options): Promise<PageContext>
}
