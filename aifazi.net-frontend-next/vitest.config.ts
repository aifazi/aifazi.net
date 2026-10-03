import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // vitest's esbuild transform otherwise uses the classic JSX runtime for
  // core/*.jsx (Next itself compiles them with the automatic runtime), which
  // fails at render with "React is not defined".
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.{ts,tsx}', 'core/**/*.test.{ts,tsx}', 'context/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
})
