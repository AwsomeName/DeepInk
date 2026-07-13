import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
    },
  },
  test: {
    include: [
      'src/main/**/*.test.ts',
      'src/renderer/**/*.test.ts',
      'src/renderer/**/*.test.tsx',
    ],
    exclude: ['out/**', 'dist/**', 'node_modules/**'],
  },
})
