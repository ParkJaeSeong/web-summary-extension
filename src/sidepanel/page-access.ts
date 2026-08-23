export type PageAccessKind = 'web' | 'file' | 'restricted'

export function pageAccessKind(value?: string): PageAccessKind {
  if (!value) return 'restricted'
  try {
    const url = new URL(value)
    if (url.protocol === 'file:') return 'file'
    if (!['http:', 'https:'].includes(url.protocol)) return 'restricted'
    if (
      url.hostname === 'chromewebstore.google.com' ||
      (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
    ) {
      return 'restricted'
    }
    return 'web'
  } catch {
    return 'restricted'
  }
}
