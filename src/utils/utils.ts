import Browser from 'webextension-polyfill'

export const AppName = 'PageMind'

export function getExtensionVersion() {
  return Browser.runtime.getManifest().version
}
