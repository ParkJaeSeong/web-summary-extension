import { describe, expect, it } from 'vitest'
import {
  pdfPermissionPattern,
  permissionOrigin,
  providerRequestUrl,
  safeExternalUrl,
  samePdfDocumentUrl,
} from './url-security'

describe('URL security', () => {
  it('allows HTTPS providers and local HTTP providers', () => {
    expect(providerRequestUrl('https://api.example.com', '/v1/chat')).toBe(
      'https://api.example.com/v1/chat',
    )
    expect(providerRequestUrl('http://localhost:11434', '/v1/chat')).toBe(
      'http://localhost:11434/v1/chat',
    )
  })

  it('allows only the PDF URL shown in the active tab', () => {
    expect(
      samePdfDocumentUrl('https://example.com/report.pdf#page=2', 'https://example.com/report.pdf'),
    ).toBe(true)
    expect(
      samePdfDocumentUrl('https://example.com/report.pdf', 'https://example.com/private.pdf'),
    ).toBe(false)
  })

  it('rejects insecure remote providers, credentials, and host-changing paths', () => {
    expect(() => providerRequestUrl('http://api.example.com', '/v1/chat')).toThrow('HTTPS')
    expect(() => providerRequestUrl('ftp://api.example.com', '/v1/chat')).toThrow('HTTP or HTTPS')
    expect(() => providerRequestUrl('https://user:pass@example.com', '/v1/chat')).toThrow(
      'credentials',
    )
    expect(() => providerRequestUrl('https://api.example.com', 'https://evil.test/chat')).toThrow(
      'relative',
    )
    expect(() => providerRequestUrl('https://api.example.com', '//evil.test/chat')).toThrow(
      'relative',
    )
  })

  it('creates exact origin permissions and blocks unsafe external links', () => {
    expect(permissionOrigin('https://api.example.com/path')).toBe('https://api.example.com/*')
    expect(pdfPermissionPattern('file:///Users/example/document.pdf')).toBe('file:///*')
    expect(safeExternalUrl('https://example.com/article')).toBe('https://example.com/article')
    expect(safeExternalUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeExternalUrl('data:text/html,bad')).toBeUndefined()
  })
})
