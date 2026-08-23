export const DATABASE_NAME = 'pagemind-local'
export const DATABASE_VERSION = 3
export const CONVERSATIONS_STORE = 'conversations'
export const PAGE_MEMORIES_STORE = 'pageMemories'
export const CONTENT_CACHE_STORE = 'contentCache'

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        const store = database.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'url' })
        store.createIndex('updatedAt', 'updatedAt')
      }
      if (!database.objectStoreNames.contains(PAGE_MEMORIES_STORE)) {
        const store = database.createObjectStore(PAGE_MEMORIES_STORE, { keyPath: 'url' })
        store.createIndex('lastVisitedAt', 'lastVisitedAt')
        store.createIndex('domain', 'domain')
      }
      if (!database.objectStoreNames.contains(CONTENT_CACHE_STORE)) {
        const store = database.createObjectStore(CONTENT_CACHE_STORE, { keyPath: 'key' })
        store.createIndex('savedAt', 'savedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
