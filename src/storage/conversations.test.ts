import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteConversation, getConversation, saveConversation } from './conversations'
import { DATABASE_NAME } from './database'

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

describe('conversations', () => {
  beforeEach(deleteDatabase)

  it('persists the selected multi-source cache keys with the URL conversation', async () => {
    await saveConversation({
      url: 'https://example.com/primary',
      title: 'Comparison',
      messages: [{ id: 'q', role: 'user', content: 'Compare these sources' }],
      sourceKeys: ['https://example.com/second', 'youtube:video:auto'],
      updatedAt: 1,
    })

    await expect(getConversation('https://example.com/primary')).resolves.toMatchObject({
      sourceKeys: ['https://example.com/second', 'youtube:video:auto'],
    })
    await deleteConversation('https://example.com/primary')
    await expect(getConversation('https://example.com/primary')).resolves.toBeUndefined()
  })
})
