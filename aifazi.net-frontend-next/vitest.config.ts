import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.{ts,tsx}', 'core/**/*.test.{ts,tsx}', 'context/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
})
