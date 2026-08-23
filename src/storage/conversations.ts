import { ChatMessage } from '@/core/page-context'
import { CONVERSATIONS_STORE, openDatabase, requestToPromise } from './database'

export interface StoredConversation {
  url: string
  title: string
  messages: ChatMessage[]
  sourceKeys?: string[]
  updatedAt: number
}

export async function getConversation(url: string): Promise<StoredConversation | undefined> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(CONVERSATIONS_STORE, 'readonly')
    return await requestToPromise(
      transaction.objectStore(CONVERSATIONS_STORE).get(url) as IDBRequest<
        StoredConversation | undefined
      >,
    )
  } finally {
    database.close()
  }
}

export async function saveConversation(conversation: StoredConversation): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(CONVERSATIONS_STORE, 'readwrite')
    await requestToPromise(transaction.objectStore(CONVERSATIONS_STORE).put(conversation))
  } finally {
    database.close()
  }
}

export async function deleteConversation(url: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(CONVERSATIONS_STORE, 'readwrite')
    await requestToPromise(transaction.objectStore(CONVERSATIONS_STORE).delete(url))
  } finally {
    database.close()
  }
}

export async function listConversations(): Promise<StoredConversation[]> {
  const database = await openDatabase()
  try {
    const store = database
      .transaction(CONVERSATIONS_STORE, 'readonly')
      .objectStore(CONVERSATIONS_STORE)
    const conversations = await requestToPromise(store.getAll() as IDBRequest<StoredConversation[]>)
    return conversations.sort((left, right) => right.updatedAt - left.updatedAt)
  } finally {
    database.close()
  }
}

export async function clearConversations(): Promise<void> {
  const database = await openDatabase()
  try {
    const store = database
      .transaction(CONVERSATIONS_STORE, 'readwrite')
      .objectStore(CONVERSATIONS_STORE)
    await requestToPromise(store.clear())
  } finally {
    database.close()
  }
}
