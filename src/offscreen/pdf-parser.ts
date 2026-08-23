import * as pdfjsLib from 'pdfjs-dist'
import Browser from 'webextension-polyfill'
import { ParsedPdfResponse } from '@/messaging'
import { parsePdfSourceUrl } from '@/utils/url-security'

export const DEFAULT_PDF_LIMITS = {
  maxCharacters: 2_000_000,
  maxPages: 500,
  maxBytes: 32 * 1024 * 1024,
}

export interface PdfLimits {
  maxCharacters: number
  maxPages: number
  maxBytes: number
}

export interface PdfParseControl {
  signal?: AbortSignal
  onProgress?: (
    stage: 'downloading' | 'parsing' | 'finishing',
    completed: number,
    total: number,
  ) => void
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('PDF parsing was cancelled.', 'AbortError')
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export async function downloadPdf(
  url: string,
  maxBytes = DEFAULT_PDF_LIMITS.maxBytes,
  signal?: AbortSignal,
) {
  const validatedUrl = parsePdfSourceUrl(url).toString()
  let response: Response
  try {
    response = await fetch(validatedUrl, { credentials: 'include', signal })
  } catch {
    throw new Error('PageMind does not have permission to download this PDF from its website.')
  }
  if (!response.ok) throw new Error(`Could not download the PDF (HTTP ${response.status}).`)
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > maxBytes)
    throw new Error(`This PDF is larger than the ${maxBytes} byte limit.`)
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > maxBytes)
    throw new Error(`This PDF is larger than the ${maxBytes} byte limit.`)
  const header = new TextDecoder('ascii').decode(buffer.slice(0, 1024))
  if (!header.includes('%PDF-')) throw new Error('The current page is not a readable PDF document.')
  return new Uint8Array(buffer)
}

export async function parsePdf(
  url: string,
  limits: PdfLimits = DEFAULT_PDF_LIMITS,
  control: PdfParseControl = {},
): Promise<ParsedPdfResponse> {
  control.onProgress?.('downloading', 0, 0)
  const loadingTask = pdfjsLib.getDocument({
    data: await downloadPdf(url, limits.maxBytes, control.signal),
    standardFontDataUrl: Browser.runtime.getURL('standard_fonts/'),
    cMapUrl: Browser.runtime.getURL('cmaps/'),
    cMapPacked: true,
  })
  throwIfAborted(control.signal)
  const pdf = await loadingTask.promise
  return extractPdfDocument(pdf, limits, control)
}

export async function extractPdfDocument(
  pdf: pdfjsLib.PDFDocumentProxy,
  limits: PdfLimits = DEFAULT_PDF_LIMITS,
  control: PdfParseControl = {},
): Promise<ParsedPdfResponse> {
  try {
    const pages: ParsedPdfResponse['pages'] = []
    let totalChars = 0
    let processedPages = 0
    const pageCount = Math.min(pdf.numPages, limits.maxPages)
    control.onProgress?.('parsing', 0, pdf.numPages)

    for (
      let pageNumber = 1;
      pageNumber <= pageCount && totalChars < limits.maxCharacters;
      pageNumber += 1
    ) {
      throwIfAborted(control.signal)
      const page = await pdf.getPage(pageNumber)
      try {
        const content = await page.getTextContent()
        const text = normalizeText(
          content.items.map((item) => ('str' in item ? item.str : '')).join(' '),
        ).slice(0, limits.maxCharacters - totalChars)
        if (text) {
          pages.push({ page: pageNumber, text })
          totalChars += text.length
        }
        processedPages = pageNumber
        control.onProgress?.('parsing', processedPages, pdf.numPages)
      } finally {
        page.cleanup()
      }
      // Let cancellation, progress rendering, and other extension work run during large PDFs.
      if (pageNumber % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        throwIfAborted(control.signal)
      }
    }

    let title: string | undefined
    try {
      const metadata = await pdf.getMetadata()
      const info = metadata.info as { Title?: string } | undefined
      title = info?.Title?.trim() || undefined
    } catch {
      // Metadata is optional; extraction can proceed without a title.
    }

    if (!pages.length) {
      throw new Error('This PDF contains no extractable text. It may require OCR.')
    }

    control.onProgress?.('finishing', processedPages, pdf.numPages)

    return {
      pages,
      title,
      processedPages,
      totalPages: pdf.numPages,
      truncated: processedPages < pdf.numPages,
    }
  } finally {
    await pdf.destroy()
  }
}
