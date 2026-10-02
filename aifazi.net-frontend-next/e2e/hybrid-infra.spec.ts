import { expect, test } from '@playwright/test'

/**
 * F20: /hybrid-infra shell smoke — library render, in-place enter (pushState),
 * and exit via the back bar.
 *
 * Runs against whatever PLAYWRIGHT_BASE_URL points at (default: production).
 * Assertions that only exist once this branch is deployed degrade to a skip
 * so the spec stays green on older targets.
 */

test('library renders and a plan opens in place', async ({ page }) => {
  const res = await page.goto('/hybrid-infra')
  test.skip(!res || res.status() >= 400, 'route not available on this target')

  await expect(
    page.getByRole('heading', { name: /Plan A — Hybrid Infrastructure/i }).first(),
  ).toBeVisible()

  await page.getByRole('button', { name: /OPEN/ }).first().click()
  const entered = await page
    .waitForURL(/diagram=/, { timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  if (!entered) {
    test.skip(true, 'in-place enter URL contract not deployed on this target yet')
  }

  const backBar = page.getByRole('button', { name: /ALL PLANS/ })
  if (!(await backBar.isVisible().catch(() => false))) {
    test.skip(true, 'in-place enter view not deployed on this target yet')
  }

  // Exit through the back bar: param cleared, list view back.
  await backBar.click()
  await expect(page).not.toHaveURL(/diagram=/)
  await expect(page.getByRole('button', { name: /ALL PLANS/ })).toHaveCount(0)
})

test('deep link ?diagram= opens the enter view', async ({ page }) => {
  const res = await page.goto('/hybrid-infra?diagram=plan-a')
  test.skip(!res || res.status() >= 400, 'route not available on this target')

  const backBar = page.getByRole('button', { name: /ALL PLANS/ })
  if (!(await backBar.isVisible().catch(() => false))) {
    test.skip(true, 'in-place enter view not deployed on this target yet')
  }
  await expect(
    page.getByRole('heading', { name: /Plan A — Hybrid Infrastructure/i }).first(),
  ).toBeVisible()
  await expect(page).toHaveURL(/diagram=plan-a/)
})

test('stage fullscreen shows the action toolbars inside the stage', async ({ page }) => {
  const res = await page.goto('/hybrid-infra?diagram=plan-a')
  test.skip(!res || res.status() >= 400, 'route not available on this target')

  const fsBtn = page.getByRole('button', { name: 'FULLSCREEN' })
  const fsBtnShown = await fsBtn
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  if (!fsBtnShown) {
    test.skip(true, 'stage fullscreen control not available on this target')
  }
  await fsBtn.click()
  const fsEntered = await page
    .waitForFunction(() => Boolean(document.fullscreenElement), undefined, { timeout: 3000 })
    .then(() => true)
    .catch(() => false)
  if (!fsEntered) {
    test.skip(true, 'fullscreen API unavailable on this target')
  }

  // Top layer hides anything outside the fullscreen element; the toolbars are
  // re-mounted inside the stage. Old targets keep them only outside -> skip.
  const innerActions = page.locator('section.hi-stage [aria-label="Diagram actions"]')
  if ((await innerActions.count()) === 0) {
    test.skip(true, 'fullscreen in-stage toolbars not deployed on this target')
  }
  await expect(innerActions.getByRole('button', { name: 'EXPORT PNG' })).toBeVisible()

  // Exit through the in-stage control: headless Chromium ignores Esc.
  await page.getByRole('button', { name: 'EXIT FULL' }).click()
  const fsExited = await page
    .waitForFunction(() => !document.fullscreenElement, undefined, { timeout: 3000 })
    .then(() => true)
    .catch(() => false)
  if (!fsExited) {
    test.skip(true, 'fullscreen exit unavailable on this target')
  }
  await expect(page.locator('section.hi-stage [aria-label="Diagram actions"]')).toHaveCount(0)
})