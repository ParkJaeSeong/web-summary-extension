import { t } from '@/i18n'

export type ErrorCode =
  | 'CONTENT_UNAVAILABLE'
  | 'CONTENT_SCRIPT_UNAVAILABLE'
  | 'PDF_PERMISSION_REQUIRED'
  | 'PDF_PERMISSION_DENIED'
  | 'PDF_TOO_LARGE'
  | 'PDF_TEXTLESS'
  | 'PDF_INVALID'
  | 'YOUTUBE_CAPTIONS_UNAVAILABLE'
  | 'YOUTUBE_TRANSCRIPT_EXTRACTION_FAILED'
  | 'PROVIDER_CONFIG_MISSING'
  | 'PROVIDER_PERMISSION_DENIED'
  | 'PROVIDER_UNAUTHORIZED'
  | 'PROVIDER_SUBSCRIPTION_REQUIRED'
  | 'PROVIDER_RATE_LIMITED'
  | 'NETWORK_OFFLINE'
  | 'EMBEDDING_FAILED'
  | 'CHAT_REQUEST_FAILED'
  | 'CITATION_MISSING'
  | 'UNKNOWN'

export class PageMindError extends Error {
  constructor(public readonly code: ErrorCode, message?: string) {
    super(message || code)
    this.name = 'PageMindError'
  }
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function errorCode(error: unknown, fallback: ErrorCode = 'UNKNOWN'): ErrorCode {
  if (error instanceof PageMindError) return error.code
  const rawMessage = errorMessage(error, String(error))
  if (ERROR_CODES.has(rawMessage as ErrorCode)) return rawMessage as ErrorCode
  const message = rawMessage.toLocaleLowerCase()
  if (/network|failed to fetch|offline/.test(message)) return 'NETWORK_OFFLINE'
  if (
    /receiving end does not exist|could not establish connection|extension context invalidated/.test(
      message,
    )
  ) {
    return 'CONTENT_SCRIPT_UNAVAILABLE'
  }
  if (/permission to download|does not have permission/.test(message))
    return 'PDF_PERMISSION_REQUIRED'
  if (/permission.*not granted/.test(message)) return 'PDF_PERMISSION_DENIED'
  if (/pdf.*larger|larger than.*limit/.test(message)) return 'PDF_TOO_LARGE'
  if (/no extractable text|require ocr/.test(message)) return 'PDF_TEXTLESS'
  if (/not a readable pdf|malformed|invalid pdf|encrypted|password/.test(message)) {
    return 'PDF_INVALID'
  }
  if (/no accessible captions|no captions/.test(message)) return 'YOUTUBE_CAPTIONS_UNAVAILABLE'
  if (/caption|transcript/.test(message) && /failed|could not/.test(message)) {
    return 'YOUTUBE_TRANSCRIPT_EXTRACTION_FAILED'
  }
  if (/api key is not configured|enter an api key/.test(message)) return 'PROVIDER_CONFIG_MISSING'
  if (/\b401\b|\b403\b|unauthorized|invalid api key/.test(message)) return 'PROVIDER_UNAUTHORIZED'
  if (/\b429\b|rate.?limit|too many requests/.test(message)) return 'PROVIDER_RATE_LIMITED'
  return fallback
}

const ERROR_MESSAGES: Record<ErrorCode, [string, string]> = {
  CONTENT_UNAVAILABLE: ['errorContentUnavailable', 'This page cannot be read.'],
  CONTENT_SCRIPT_UNAVAILABLE: [
    'errorContentScriptUnavailable',
    'PageMind cannot access this page. Refresh it and try again.',
  ],
  PDF_PERMISSION_REQUIRED: [
    'errorPdfPermissionRequired',
    'Allow PageMind to access this PDF website, then try again.',
  ],
  PDF_PERMISSION_DENIED: [
    'errorPdfPermissionDenied',
    'Permission to read this PDF was not granted.',
  ],
  PDF_TOO_LARGE: ['errorPdfTooLarge', 'This PDF exceeds the local size limit.'],
  PDF_TEXTLESS: ['errorPdfTextless', 'This PDF has no extractable text and may require OCR.'],
  PDF_INVALID: ['errorPdfInvalid', 'This PDF is encrypted, damaged, or unsupported.'],
  YOUTUBE_CAPTIONS_UNAVAILABLE: [
    'errorCaptionsUnavailable',
    'This video has no accessible captions.',
  ],
  YOUTUBE_TRANSCRIPT_EXTRACTION_FAILED: [
    'errorTranscriptFailed',
    'PageMind could not extract this video’s captions. Refresh the video and try again.',
  ],
  PROVIDER_CONFIG_MISSING: [
    'errorProviderConfigMissing',
    'Configure an API key or a local provider in Settings.',
  ],
  PROVIDER_PERMISSION_DENIED: [
    'errorProviderPermissionDenied',
    'Permission to connect to this provider was not granted.',
  ],
  PROVIDER_UNAUTHORIZED: [
    'errorProviderUnauthorized',
    'The provider rejected the credentials. Check the API key in Settings.',
  ],
  PROVIDER_SUBSCRIPTION_REQUIRED: [
    'errorProviderSubscriptionRequired',
    'This model requires a paid subscription or additional account credits.',
  ],
  PROVIDER_RATE_LIMITED: [
    'errorProviderRateLimited',
    'The provider rate limit was reached. Wait a moment and try again.',
  ],
  NETWORK_OFFLINE: ['errorNetworkOffline', 'The network request failed. Check your connection.'],
  EMBEDDING_FAILED: [
    'errorEmbeddingFailed',
    'Semantic indexing failed. Keyword search is still available.',
  ],
  CHAT_REQUEST_FAILED: ['errorChatFailed', 'The AI provider could not answer this request.'],
  CITATION_MISSING: [
    'errorCitationMissing',
    'The cited location is no longer available. Refresh the content.',
  ],
  UNKNOWN: ['errorUnknown', 'Something went wrong. Please try again.'],
}

const ERROR_CODES = new Set<ErrorCode>(Object.keys(ERROR_MESSAGES) as ErrorCode[])

export function userErrorMessage(error: unknown, fallback: ErrorCode = 'UNKNOWN') {
  const [key, message] = ERROR_MESSAGES[errorCode(error, fallback)]
  return t(key, message)
}
