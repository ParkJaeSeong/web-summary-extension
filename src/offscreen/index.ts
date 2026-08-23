import * as pdfjsLib from 'pdfjs-dist'
import { isRuntimeMessage, MessageError, ParsedPdfResponse, sendRuntimeMessage } from '@/messaging'
import { errorMessage } from '@/utils/errors'
import Browser from 'webextension-polyfill'
import { parsePdf } from './pdf-parser'
import { IdleLifecycle } from './idle-lifecycle'

pdfjsLib.GlobalWorkerOptions.workerSrc = Browser.runtime.getURL('pdf.worker.min.js')

const parseControllers = new Map<string, AbortController>()
const idleLifecycle = new IdleLifecycle(60_000, async () => {
  await sendRuntimeMessage({ type: 'OFFSCREEN_IDLE' }).catch(() => false)
})

Browser.runtime.onMessage.addListener((message) => {
  if (!isRuntimeMessage(message)) return
  if (message.type === 'PING_OFFSCREEN') return Promise.resolve(true)
  if (message.type === 'GET_OFFSCREEN_STATUS') {
    return Promise.resolve({ activeJobs: parseControllers.size })
  }
  if (message.type === 'CANCEL_PDF_PARSE') {
    const controller = parseControllers.get(message.data.requestId)
    controller?.abort()
    return Promise.resolve(Boolean(controller))
  }
  if (message.type !== 'PARSE_PDF') return
  const { requestId, url } = message.data
  idleLifecycle.active()
  parseControllers.get(requestId)?.abort()
  const controller = new AbortController()
  parseControllers.set(requestId, controller)
  return parsePdf(url, undefined, {
    signal: controller.signal,
    onProgress(stage, completed, total) {
      sendRuntimeMessage({
        type: 'PDF_PARSE_PROGRESS',
        data: { requestId, stage, completed, total },
      }).catch(() => {})
    },
  })
    .catch(
      (error: unknown): MessageError => ({
        error: errorMessage(error, 'Failed to parse the PDF.'),
      }),
    )
    .finally(() => {
      if (parseControllers.get(requestId) === controller) parseControllers.delete(requestId)
      if (parseControllers.size === 0) idleLifecycle.idle()
    }) satisfies Promise<ParsedPdfResponse | MessageError>
})
