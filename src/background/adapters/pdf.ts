import { ContentAdapter } from '@/core/content-adapter'
import { PageContext } from '@/core/page-context'
import { sendRuntimeMessage } from '@/messaging'
import Browser from 'webextension-polyfill'
import { parsePdfSourceUrl, pdfPermissionPattern } from '@/utils/url-security'
import { PageMindError } from '@/utils/errors'

const OFFSCREEN_URL = 'offscreen.html'
let offscreenSetup: Promise<void> | undefined

async function pingOffscreen(retries: number) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const ready = await sendRuntimeMessage({ type: 'PING_OFFSCREEN' }).catch(() => undefined)
    if (ready) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

async function hasOffscreenDocument() {
  if (typeof chrome.runtime.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    })
    return contexts.length > 0
  }
  if (typeof chrome.offscreen.hasDocument === 'function') {
    return chrome.offscreen.hasDocument()
  }
  return false
}

async function setupOffscreenDocument() {
  if (typeof chrome === 'undefined' || !chrome.offscreen) {
    throw new Error('PDF reading is not supported in this browser.')
  }
  if (await hasOffscreenDocument()) {
    if (await pingOffscreen(3)) return
    await chrome.offscreen.closeDocument()
  }
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Extract text from PDF documents using pdf.js.',
  })
  if (!(await pingOffscreen(40))) {
    throw new Error('The PDF reader did not start in time.')
  }
}

async function ensureOffscreenDocument() {
  if (!offscreenSetup) {
    offscreenSetup = setupOffscreenDocument().finally(() => {
      offscreenSetup = undefined
    })
  }
  return offscreenSetup
}

export async function closeOffscreenDocumentIfIdle() {
  if (typeof chrome === 'undefined' || !chrome.offscreen || !(await hasOffscreenDocument())) {
    return false
  }
  const status = await sendRuntimeMessage({ type: 'GET_OFFSCREEN_STATUS' }).catch(() => undefined)
  if (!status || status.activeJobs > 0) return false
  await chrome.offscreen.closeDocument()
  return true
}

export function pdfFallbackTitle(url: string) {
  const fallback = url.split('/').pop() || url
  try {
    return decodeURIComponent(fallback)
  } catch {
    return fallback
  }
}

export const pdfAdapter: ContentAdapter<{ url: string; requestId: string }> = {
  sourceType: 'pdf',
  canExtract(url) {
    return url.pathname.toLocaleLowerCase().endsWith('.pdf')
  },
  async extract(options): Promise<PageContext> {
    if (!options?.url || !options.requestId)
      throw new Error('A PDF URL and request ID are required.')
    const validatedUrl = parsePdfSourceUrl(options.url).toString()
    const granted = await Browser.permissions.contains({
      origins: [pdfPermissionPattern(validatedUrl)],
    })
    if (!granted) throw new PageMindError('PDF_PERMISSION_REQUIRED')
    await ensureOffscreenDocument()
    const result = await sendRuntimeMessage({
      type: 'PARSE_PDF',
      data: { url: validatedUrl, requestId: options.requestId },
    })
    if (!result) throw new Error('The PDF reader did not respond.')
    if ('error' in result) throw new Error(result.error)

    return {
      sourceType: 'pdf',
      url: validatedUrl,
      title: result.title || pdfFallbackTitle(validatedUrl),
      description: '',
      chunks: result.pages.map(({ page, text }) => ({
        id: `pdf-page-${page}`,
        text,
        location: { type: 'pdf', page },
      })),
      capturedAt: Date.now(),
      extraction: {
        status: result.truncated ? 'partial' : 'complete',
        processedUnits: result.processedPages,
        totalUnits: result.totalPages,
        truncated: result.truncated,
      },
      totalPages: result.totalPages,
    }
  },
}
