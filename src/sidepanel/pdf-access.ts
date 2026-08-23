import Browser from 'webextension-polyfill'
import { PageMindError } from '@/utils/errors'
import { pdfPermissionPattern } from '@/utils/url-security'

export function pdfPermissionOrigin(url: string) {
  const parsed = new URL(url)
  if (parsed.protocol === 'file:') {
    return 'file:///*'
  }
  try {
    return pdfPermissionPattern(url)
  } catch {
    throw new PageMindError(
      'PDF_INVALID',
      'PageMind can request PDF access only for HTTP or HTTPS websites.',
    )
  }
}

export async function requestPdfAccess(url: string) {
  if (new URL(url).protocol === 'file:') {
    const enabled = await Browser.permissions.contains({ origins: ['file:///*'] })
    if (!enabled) {
      throw new PageMindError(
        'PDF_PERMISSION_REQUIRED',
        'Enable “Allow access to file URLs” for PageMind in chrome://extensions.',
      )
    }
    return
  }
  const granted = await Browser.permissions.request({ origins: [pdfPermissionOrigin(url)] })
  if (!granted) {
    throw new PageMindError('PDF_PERMISSION_DENIED', 'Permission to read this PDF was not granted.')
  }
}

export async function recoverPdfAccess(url: string, retry: () => Promise<void>) {
  await requestPdfAccess(url)
  await retry()
}
