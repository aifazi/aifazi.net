import { defineConfig } from '@playwright/test'

/**
 * Smoke tests run against production (read-only GETs only).
 * For local runs: `npm run dev` in another shell, then
 * `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://aifazi.net',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
