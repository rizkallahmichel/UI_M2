import { test, expect } from '@playwright/test'

test.describe('ECG Research Console smoke test', () => {
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

  test('navigates between Participants and Enrollment tabs', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /ECG Research Console/i })).toBeVisible({ timeout: 15000 })

    const enrollmentTab = page.getByRole('button', { name: /Enrollment/i })
    await enrollmentTab.click()
    await expect(enrollmentTab).toHaveClass(/active/)

    await page.getByRole('button', { name: /Participants/i }).click()
    await expect(page.getByRole('button', { name: /Participants/ })).toHaveClass(/active/)
  })
})
