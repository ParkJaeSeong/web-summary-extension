const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isLocalHostname(hostname: string) {
  return LOCAL_HOSTS.has(hostname.toLocaleLowerCase())
}

export function parseSafeHttpUrl(value: string, allowRemoteHttp = false) {
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value)
  const url = new URL(hasScheme ? value : `https://${value}`)
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new Error('Only HTTP or HTTPS URLs are supported.')
  }
  if (url.username || url.password) throw new Error('URLs containing credentials are not allowed.')
  if (url.protocol === 'http:' && !allowRemoteHttp && !isLocalHostname(url.hostname)) {
    throw new Error('Remote providers must use HTTPS.')
  }
  return url
}

export function permissionOrigin(value: string, allowRemoteHttp = false) {
  const url = parseSafeHttpUrl(value, allowRemoteHttp)
  return `${url.protocol}//${url.host}/*`
}

export function parsePdfSourceUrl(value: string) {
  const url = new URL(value)
  if (url.protocol === 'file:') {
    if (url.username || url.password) throw new Error('Invalid local file URL.')
    return url
  }
  return parseSafeHttpUrl(value, true)
}

export function pdfPermissionPattern(value: string) {
  const url = parsePdfSourceUrl(value)
  return url.protocol === 'file:' ? 'file:///*' : permissionOrigin(url.toString(), true)
}

export function samePdfDocumentUrl(left: string, right: string) {
  const leftUrl = parsePdfSourceUrl(left)
  const rightUrl = parsePdfSourceUrl(right)
  leftUrl.hash = ''
  rightUrl.hash = ''
  return leftUrl.toString() === rightUrl.toString()
}

export function providerRequestUrl(apiHost: string, apiPath: string) {
  const base = parseSafeHttpUrl(apiHost)
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(apiPath)) {
    throw new Error('Provider API paths must be relative to the configured host.')
  }
  const result = new URL(apiPath || '/', base)
  if (result.origin !== base.origin) throw new Error('Provider API paths cannot change the host.')
  return result.toString()
}

export function safeExternalUrl(value?: string) {
  if (!value) return
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined
  } catch {
    return undefined
  }
}
