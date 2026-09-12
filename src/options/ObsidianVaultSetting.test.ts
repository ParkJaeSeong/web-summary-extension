import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { chooseObsidianVault } from '../sidepanel/obsidian-export'
import ObsidianVaultSetting from './ObsidianVaultSetting'

const container = document.createElement('div')
afterEach(() => {
  render(null, container)
  vi.unstubAllGlobals()
})

it('changes the saved Vault from settings and preserves it when selection is cancelled', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  const picker = vi.fn().mockResolvedValue({ name: 'Old Vault', kind: 'directory' })
  vi.stubGlobal('showDirectoryPicker', picker)
  await chooseObsidianVault()
  await act(async () => {
    render(h(ObsidianVaultSetting, {}), container)
  })
  await vi.waitFor(() => expect(container.textContent).toContain('Old Vault'))
  picker.mockResolvedValue({ name: 'New Vault', kind: 'directory' })
  await vi.waitFor(() => expect(container.querySelector('button')!.disabled).toBe(false))
  await act(async () => {
    container.querySelector('button')!.click()
  })
  await vi.waitFor(() => expect(container.textContent).toContain('New Vault'))
  await act(async () => {
    render(null, container)
    render(h(ObsidianVaultSetting, {}), container)
  })
  await vi.waitFor(() => expect(container.textContent).toContain('New Vault'))
  picker.mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
  await vi.waitFor(() => expect(container.querySelector('button')!.disabled).toBe(false))
  await act(async () => {
    container.querySelector('button')!.click()
  })
  expect(container.textContent).toContain('New Vault')
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('shows selection errors without replacing the current Vault', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  const picker = vi.fn().mockResolvedValue({ name: 'Existing Vault', kind: 'directory' })
  vi.stubGlobal('showDirectoryPicker', picker)
  await chooseObsidianVault()
  await act(async () => {
    render(h(ObsidianVaultSetting, {}), container)
  })
  await vi.waitFor(() => expect(container.textContent).toContain('Existing Vault'))
  picker.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
  await vi.waitFor(() => expect(container.querySelector('button')!.disabled).toBe(false))
  await act(async () => {
    container.querySelector('button')!.click()
  })
  await vi.waitFor(() =>
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not select'),
  )
  expect(container.textContent).toContain('Existing Vault')
  expect(container.querySelector('button')!.disabled).toBe(false)
})

it('disables Vault selection when the browser does not support it', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  await act(async () => {
    render(h(ObsidianVaultSetting, {}), container)
  })
  expect(container.querySelector('button')!.disabled).toBe(true)
  expect(container.textContent).toContain('not supported')
})
