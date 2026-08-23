import Browser from 'webextension-polyfill'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pdfPermissionOrigin, recoverPdfAccess, requestPdfAccess } from './pdf-access'

describe('PDF access recovery', () => {
  const request = vi.mocked(Browser.permissions.request)
  const contains = vi.mocked(Browser.permissions.contains)

  beforeEach(() => {
    request.mockReset()
    contains.mockReset()
    contains.mockResolvedValue(true)
  })

  it('requests only the PDF website origin', async () => {
    request.mockResolvedValue(true)

    await requestPdfAccess('https://papers.example.org/reports/file.pdf?download=1')

    expect(request).toHaveBeenCalledWith({ origins: ['https://papers.example.org/*'] })
  })

  it('reports permission denial', async () => {
    request.mockResolvedValue(false)

    await expect(requestPdfAccess('https://example.com/file.pdf')).rejects.toThrow('not granted')
  })

  it('retries PDF loading only after permission is granted', async () => {
    const retry = vi.fn().mockResolvedValue(undefined)
    request.mockResolvedValue(true)

    await recoverPdfAccess('https://example.com/file.pdf', retry)
    expect(retry).toHaveBeenCalledOnce()

    retry.mockClear()
    request.mockResolvedValue(false)
    await expect(recoverPdfAccess('https://example.com/file.pdf', retry)).rejects.toThrow()
    expect(retry).not.toHaveBeenCalled()
  })

  it('uses Chrome file access and explains when the toggle is disabled', async () => {
    expect(pdfPermissionOrigin('file:///Users/example/file.pdf')).toBe('file:///*')
    contains.mockResolvedValue(false)

    await expect(requestPdfAccess('file:///Users/example/file.pdf')).rejects.toThrow(
      'Allow access to file URLs',
    )
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects unsupported protocols', () => {
    expect(() => pdfPermissionOrigin('ftp://example.com/file.pdf')).toThrow('HTTP or HTTPS')
  })
})
