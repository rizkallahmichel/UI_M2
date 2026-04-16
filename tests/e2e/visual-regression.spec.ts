import { test, expect } from '@playwright/test'
import { mockBackend } from './utils'

test.describe('Visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('overview screen should match baseline', async ({ page }) => {
    await expect(page).toHaveScreenshot('overview.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    })
  })

  test('collect screen should match baseline', async ({ page }) => {
    await page.getByRole('button', { name: /collect/i }).first().click()
    await expect(page).toHaveScreenshot('collect.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    })
  })

  test('verify screen should match baseline', async ({ page }) => {
    await page.getByRole('button', { name: /verify/i }).first().click()
    await expect(page).toHaveScreenshot('verify.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    })
  })
})
