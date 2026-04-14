import { test, expect } from '@playwright/test'

test.describe('ECG identity workflow smoke test', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (message) => console.log(`[ui console] ${message.type()}: ${message.text()}`))
    await page.route('http://localhost:5104/**', async (route) => {
      if (route.request().url().endsWith('/api/ecg-auth/sessions')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        return
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })
  })

  test('switches between compact workspace views', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Compact workspace for collection, testing, and backend review/i })).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByRole('heading', { name: /Participants and model/i })).toBeVisible()

    await page.getByRole('button', { name: /^Collect 0$/i }).click()
    await expect(page.getByRole('heading', { name: /Collect a new ECG sample/i })).toBeVisible()

    await page.getByRole('button', { name: /^Verify 0$/i }).click()
    await expect(page.getByRole('heading', { name: /Identity test/i })).toBeVisible()

    await page.getByRole('button', { name: /^Logs 0$/i }).click()
    await expect(page.getByRole('heading', { name: /Operation log/i })).toBeVisible()
  })
})
