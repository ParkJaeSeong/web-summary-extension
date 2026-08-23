import Browser from 'webextension-polyfill'

export function t(key: string, fallback: string, substitutions?: string | string[]) {
  try {
    return Browser.i18n.getMessage(key, substitutions) || fallback
  } catch {
    return fallback
  }
}
