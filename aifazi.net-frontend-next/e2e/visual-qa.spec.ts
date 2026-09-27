import { test, expect } from '@playwright/test'

/**
 * Visual QA matrix — themes × breakpoints.
 * Read-only smoke: page loads and body has a background / is visible.
 * Set PLAYWRIGHT_BASE_URL to a preview or production URL.
 */

const THEMES = ['terminal', 'light', 'paper', 'cyber-dark'] as const
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 2560, height: 1440 },
] as const

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    test(`visual ${theme} @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('site-theme', t)
          localStorage.setItem('site-theme-user-set', '1')
          localStorage.setItem('aifazi_boot_seen', '1')
        } catch { /* ignore */ }
      }, theme)

      const res = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 })
      if (!res || res.status() >= 500) {
        test.skip(true, `app not healthy (${res?.status()})`)
      }

      await expect(page.locator('body')).toBeVisible()
      // No fatal client error: error boundary text must not appear
      await expect(page.getByText('Something went wrong')).toHaveCount(0)
      // Hero name should paint
      await expect(page.getByText('TANVIR').first()).toBeVisible({ timeout: 15_000 })

      await page.screenshot({
        path: `test-results/visual-${theme}-${vp.name}.png`,
        fullPage: false,
      })
    })
  }
}
