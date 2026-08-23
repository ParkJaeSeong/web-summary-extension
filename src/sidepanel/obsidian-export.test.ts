import { describe, expect, it, vi } from 'vitest'
import {
  normalizeVaultFolder,
  resolveVaultFolder,
  saveMarkdownToDirectory,
  supportsObsidianVaultExport,
} from './obsidian-export'

describe('Obsidian vault export', () => {
  it('writes the Markdown note into the selected directory', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const createWritable = vi.fn().mockResolvedValue({ write, close })
    const getFileHandle = vi.fn().mockResolvedValue({ createWritable })

    await saveMarkdownToDirectory(
      { getFileHandle } as unknown as FileSystemDirectoryHandle,
      'PageMind note.md',
      '# Note',
    )

    expect(getFileHandle).toHaveBeenCalledWith('PageMind note.md', { create: true })
    expect(write).toHaveBeenCalledWith('# Note')
    expect(close).toHaveBeenCalledOnce()
  })

  it('detects File System Access API support', () => {
    expect(supportsObsidianVaultExport({ showDirectoryPicker: vi.fn() } as unknown as Window)).toBe(
      true,
    )
    expect(supportsObsidianVaultExport({} as Window)).toBe(false)
  })

  it('normalizes and creates a nested folder inside the Vault', async () => {
    const pageMind = { name: 'PageMind', getDirectoryHandle: vi.fn() }
    const clips = { name: 'Clips', getDirectoryHandle: vi.fn().mockResolvedValue(pageMind) }
    const root = { name: 'Vault', getDirectoryHandle: vi.fn().mockResolvedValue(clips) }

    expect(normalizeVaultFolder(' Inbox / Clips ')).toBe('Inbox/Clips')
    expect(normalizeVaultFolder('../Page:Mind')).toBe('Page-Mind')
    await expect(
      resolveVaultFolder(root as unknown as FileSystemDirectoryHandle, 'Inbox/Clips'),
    ).resolves.toBe(pageMind)
    expect(root.getDirectoryHandle).toHaveBeenCalledWith('Inbox', { create: true })
    expect(clips.getDirectoryHandle).toHaveBeenCalledWith('Clips', { create: true })
  })
})
