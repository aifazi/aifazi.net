import { expect, test } from '@playwright/test'

test('homepage loads', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBeLessThan(400)
  await expect(page).toHaveTitle(/Tanvir|aifazi/i)
})

test('backend health is reachable through the proxy', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
})

test('login page renders credentials form', async ({ page }) => {
  const res = await page.goto('/login')
  expect(res?.status()).toBeLessThan(400)
  await expect(page.locator('input[type="password"]')).toBeVisible()
})

test('blog index renders', async ({ page }) => {
  const res = await page.goto('/blog')
  expect(res?.status()).toBeLessThan(400)
})

test('status page renders', async ({ page }) => {
  const res = await page.goto('/status')
  expect(res?.status()).toBeLessThan(400)
})

test('unknown route returns 404', async ({ request }) => {
  const res = await request.get('/this-route-does-not-exist-xyz')
  expect(res.status()).toBe(404)
})
