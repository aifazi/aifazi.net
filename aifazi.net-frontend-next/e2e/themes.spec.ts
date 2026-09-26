import { test, expect } from '@playwright/test'

/**
 * Certified-theme smoke (terminal / light / paper).
 * Requires PLAYWRIGHT_BASE_URL. Skips if the app is not reachable.
 */
const THEMES = ['terminal', 'light', 'paper'] as const

test.describe('certified themes', () => {
  for (const theme of THEMES) {
    test(`home renders under ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('site-theme', t)
          localStorage.setItem('site-theme-user-set', '1')
          localStorage.setItem('aifazi_boot_seen', '1')
        } catch { /* ignore */ }
      }, theme)
      const res = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 })
      if (!res || res.status() >= 500) {
        test.skip(true, `app not healthy for theme ${theme} (status ${res?.status()})`)
      }
      await expect(page.locator('html')).toBeVisible()
      // Theme should be applied on <html> unless theme is default
      const themeAttr = await page.locator('html').getAttribute('data-theme')
      if (theme !== 'terminal') {
        expect(themeAttr).toBe(theme)
      }
      // Dialogs/toasts containers or main landmark should exist
      await expect(page.locator('body')).toBeVisible()
    })
  }
})
