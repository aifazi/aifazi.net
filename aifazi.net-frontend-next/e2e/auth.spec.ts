import { expect, test } from '@playwright/test'

/**
 * Auth surface smoke (read-only unless E2E_USER / E2E_PASS are set).
 * Safe against production: never registers, never deletes accounts.
 */

test('login page renders sign-in form', async ({ page }) => {
  const res = await page.goto('/login')
  expect(res?.status()).toBeLessThan(400)
  await expect(page.locator('body')).toBeVisible()
  // Primary auth controls must exist (labels or inputs)
  const user = page.locator('input[name="username"], input#username, input[type="text"]').first()
  const pass = page.locator('input[type="password"]').first()
  await expect(user).toBeVisible({ timeout: 10_000 })
  await expect(pass).toBeVisible({ timeout: 10_000 })
})

test('login page has password recovery affordance', async ({ page }) => {
  await page.goto('/login')
  const forgot = page.getByText(/forgot|reset password|recover/i).first()
  await expect(forgot).toBeVisible({ timeout: 10_000 })
})

test('profile route redirects or prompts auth when logged out', async ({ page }) => {
  await page.goto('/profile')
  await expect(page.locator('body')).toBeVisible()
  // Either a login prompt or redirect to /login
  const url = page.url()
  const hasAuthCta = await page
    .getByText(/sign in|log in|login/i)
    .first()
    .isVisible()
    .catch(() => false)
  expect(url.includes('/login') || hasAuthCta).toBeTruthy()
})

test('admin route denies anonymous visitors (SSR gate)', async ({ page }) => {
  const res = await page.goto('/admin')
  expect(res?.status()).toBeLessThan(500)
  const url = page.url()
  const body = await page.locator('body').innerText().catch(() => '')
  // Either redirected to login, or renders an access-denied state — never the admin dashboard
  const denied = /sign in|log in|login|denied|forbidden|not authorized|no access/i.test(body)
  expect(url.includes('/login') || url.includes('/auth') || denied).toBeTruthy()
})

test('optional: login with E2E_USER / E2E_PASS', async ({ page }) => {
  const user = process.env.E2E_USER
  const pass = process.env.E2E_PASS
  test.skip(!user || !pass, 'E2E_USER / E2E_PASS not set')

  await page.goto('/login')
  await page.locator('input[name="username"], input#username, input[type="text"]').first().fill(user!)
  await page.locator('input[type="password"]').first().fill(pass!)
  const submit = page.locator('button[type="submit"]').first()
  await submit.click()
  // Land somewhere authenticated — do not assert account data
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15_000 }).catch(() => {})
  expect(page.url()).not.toContain('/login')
})
