import Browser from 'webextension-polyfill'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorCode, PageMindError, userErrorMessage } from './errors'

describe('PageMind errors', () => {
  beforeEach(() => {
    vi.mocked(Browser.i18n.getMessage).mockReturnValue('')
  })

  it.each([
    ['Could not establish connection. Receiving end does not exist.', 'CONTENT_SCRIPT_UNAVAILABLE'],
    ['Extension context invalidated.', 'CONTENT_SCRIPT_UNAVAILABLE'],
    ['PageMind does not have permission to download this PDF.', 'PDF_PERMISSION_REQUIRED'],
    ['This PDF is larger than the limit.', 'PDF_TOO_LARGE'],
    ['This PDF contains no extractable text. It may require OCR.', 'PDF_TEXTLESS'],
    ['No password given for encrypted PDF', 'PDF_INVALID'],
    ['Request failed: 401 invalid API key secret-detail', 'PROVIDER_UNAUTHORIZED'],
    ['PROVIDER_SUBSCRIPTION_REQUIRED', 'PROVIDER_SUBSCRIPTION_REQUIRED'],
    ['Request failed: 429 too many requests', 'PROVIDER_RATE_LIMITED'],
    ['Failed to fetch', 'NETWORK_OFFLINE'],
  ])('classifies %s', (message, code) => {
    expect(errorCode(new Error(message))).toBe(code)
  })

  it('preserves explicit stable error codes', () => {
    expect(errorCode(new PageMindError('CITATION_MISSING'))).toBe('CITATION_MISSING')
  })

  it('does not expose raw provider response bodies to the user', () => {
    const message = userErrorMessage(
      new Error('Request failed: 401 invalid API key sk-secret-provider-body'),
      'CHAT_REQUEST_FAILED',
    )

    expect(message).toBe('The provider rejected the credentials. Check the API key in Settings.')
    expect(message).not.toContain('sk-secret')
  })
})
