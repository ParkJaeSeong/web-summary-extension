import Browser from 'webextension-polyfill'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from './i18n'

describe('t', () => {
  const getMessage = vi.mocked(Browser.i18n.getMessage)

  beforeEach(() => {
    getMessage.mockReset()
  })

  it('uses the Chrome UI locale message', () => {
    getMessage.mockReturnValue('현재 페이지')

    expect(t('currentPage', 'Current page')).toBe('현재 페이지')
  })

  it('uses the English fallback when a locale key is unavailable', () => {
    getMessage.mockReturnValue('')

    expect(t('currentPage', 'Current page')).toBe('Current page')
  })
})
