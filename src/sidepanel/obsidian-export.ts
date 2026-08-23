const DATABASE_NAME = 'pagemind-file-handles'
const STORE_NAME = 'directories'
const VAULT_KEY = 'obsidian-vault'

interface PermissionDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(options?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(options?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker(options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: FileSystemHandle | string
  }): Promise<FileSystemDirectoryHandle>
}

function openHandleDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function storedVaultHandle() {
  const database = await openHandleDatabase()
  try {
    return await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(VAULT_KEY)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

async function storeVaultHandle(handle: FileSystemDirectoryHandle) {
  const database = await openHandleDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(handle, VAULT_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

async function writableStoredHandle() {
  const handle = (await storedVaultHandle()) as PermissionDirectoryHandle | undefined
  if (!handle) return
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return handle
  if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') return handle
}

export function supportsObsidianVaultExport(target: Window = window) {
  return 'showDirectoryPicker' in target
}

export async function chooseObsidianVault(target: Window = window) {
  if (!supportsObsidianVaultExport(target)) throw new Error('FILE_SYSTEM_ACCESS_UNAVAILABLE')
  const handle = await (target as DirectoryPickerWindow).showDirectoryPicker({
    id: 'pagemind-obsidian-vault',
    mode: 'readwrite',
  })
  await storeVaultHandle(handle)
  return handle
}

export async function saveMarkdownToDirectory(
  directory: FileSystemDirectoryHandle,
  filename: string,
  content: string,
) {
  const file = await directory.getFileHandle(filename, { create: true })
  const writable = await file.createWritable()
  try {
    await writable.write(content)
    await writable.close()
  } catch (error: unknown) {
    await writable.abort().catch(() => {})
    throw error
  }
}

export function normalizeVaultFolder(folder: string) {
  return folder
    .split(/[\\/]+/)
    .map((part) => part.trim().replace(/[<>:"|?*]/g, '-'))
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
}

export async function resolveVaultFolder(root: FileSystemDirectoryHandle, folder: string) {
  let directory = root
  for (const part of normalizeVaultFolder(folder).split('/').filter(Boolean)) {
    directory = await directory.getDirectoryHandle(part, { create: true })
  }
  return directory
}

export async function saveMarkdownToObsidianVault(
  filename: string,
  content: string,
  folder = 'PageMind',
  target: Window = window,
) {
  const root = (await writableStoredHandle()) || (await chooseObsidianVault(target))
  const directory = await resolveVaultFolder(root, folder)
  await saveMarkdownToDirectory(directory, filename, content)
  const normalizedFolder = normalizeVaultFolder(folder)
  return normalizedFolder ? `${root.name}/${normalizedFolder}` : root.name
}
