import { expect, test } from '@playwright/test'

test('homepage loads', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBeLessThan(400)
  await expect(page).toHaveTitle(/aifazi/i)
})

test('backend health is reachable through the proxy', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
})
