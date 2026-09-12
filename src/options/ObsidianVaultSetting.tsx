import { t } from '@/i18n'
import {
  chooseObsidianVault,
  storedVaultHandle,
  supportsObsidianVaultExport,
} from '@/sidepanel/obsidian-export'
import { useEffect, useState } from 'preact/hooks'

export default function ObsidianVaultSetting() {
  const [vaultName, setVaultName] = useState('')
  const [loading, setLoading] = useState(true)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState('')
  const supported = supportsObsidianVaultExport()

  useEffect(() => {
    let active = true
    storedVaultHandle()
      .then((handle) => {
        if (active) setVaultName(handle?.name || '')
      })
      .catch(() => {
        if (active)
          setError(
            t('obsidianVaultLoadFailed', 'Could not load the saved Vault. Please select it again.'),
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const chooseVault = async () => {
    setChoosing(true)
    setError('')
    try {
      const handle = await chooseObsidianVault()
      setVaultName(handle.name)
    } catch (error: unknown) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setError(t('obsidianVaultSelectFailed', 'Could not select the Vault. Please try again.'))
      }
    } finally {
      setChoosing(false)
    }
  }

  return (
    <div className="obsidian-vault-setting">
      <div className="setting-row">
        <div aria-live="polite">
          <strong>{t('obsidianVault', 'Vault')}</strong>
          <p>{vaultName || t('obsidianVaultNotSelected', 'No Vault selected')}</p>
        </div>
        <button
          className="text-button"
          type="button"
          disabled={!supported || loading || choosing}
          onClick={chooseVault}
        >
          {vaultName
            ? t('changeObsidianVault', 'Change Vault')
            : t('chooseObsidianVault', 'Choose Vault')}
        </button>
      </div>
      {!supported && (
        <p>{t('obsidianUnsupported', 'Direct Vault saving is not supported in this browser.')}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
