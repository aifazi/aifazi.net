import { expect, test } from '@playwright/test'

/**
 * Store smoke (read-only). Never places orders or mutates cart state on prod.
 * For a real purchase path, set E2E_STORE_CHECKOUT=1 and run against a
 * staging/stripe-test environment only.
 */

test('store catalog loads', async ({ page }) => {
  const res = await page.goto('/store')
  expect(res?.status()).toBeLessThan(400)
  await expect(page.locator('body')).toBeVisible()
  // Product grid or empty state should render
  const hasGrid = await page
    .locator('[class*="store-grid"], [class*="product"], main')
    .first()
    .isVisible()
    .catch(() => false)
  expect(hasGrid).toBeTruthy()
})

test('store page has cart affordance', async ({ page }) => {
  await page.goto('/store')
  const cart = page.getByText(/cart|basket/i).first()
  await expect(cart).toBeVisible({ timeout: 10_000 })
})

test('product detail route responds', async ({ page }) => {
  // Pick any product link from the catalog
  await page.goto('/store')
  const productLink = page.locator('a[href*="/store/"]').first()
  const hasProduct = await productLink.isVisible().catch(() => false)
  test.skip(!hasProduct, 'no product links on catalog (empty store)')
  await productLink.click()
  await expect(page.locator('body')).toBeVisible()
  expect(page.url()).toContain('/store')
})

test('checkout stays blocked without auth', async ({ page }) => {
  await page.goto('/store')
  const checkout = page.getByText(/checkout|buy now|purchase/i).first()
  const hasCheckout = await checkout.isVisible().catch(() => false)
  test.skip(!hasCheckout, 'no checkout CTA visible')
  // Clicking should prompt login or open cart — must not silently charge
  await checkout.click()
  const prompted = page.url().includes('/login') ||
    (await page.getByText(/sign in|log in|cart|payment/i).first().isVisible().catch(() => false))
  expect(prompted).toBeTruthy()
})
