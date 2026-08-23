import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'https://www.youtube.com/watch?v=video-id' },
    },
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
})
