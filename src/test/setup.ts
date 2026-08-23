import 'fake-indexeddb/auto'
import { beforeEach, vi } from 'vitest'

const localValues: Record<string, unknown> = {}

const local = {
  async get(keys?: string | string[] | Record<string, unknown> | null) {
    if (keys == null) return { ...localValues }
    if (typeof keys === 'string') return { [keys]: localValues[keys] }
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, localValues[key]]))
    }
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [key, localValues[key] ?? fallback]),
    )
  },
  async set(values: Record<string, unknown>) {
    Object.assign(localValues, values)
  },
  async clear() {
    for (const key of Object.keys(localValues)) delete localValues[key]
  },
}

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: { local },
    runtime: {
      getURL: (path: string) => path,
    },
    permissions: {
      request: vi.fn(),
      contains: vi.fn().mockResolvedValue(true),
    },
    i18n: {
      getMessage: vi.fn().mockReturnValue(''),
    },
  },
}))

beforeEach(async () => {
  await local.clear()
})
