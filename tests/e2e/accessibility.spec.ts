import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'
import { mockBackend } from './utils'

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('overview should have no critical a11y violations', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze()
    const critical = accessibilityScanResults.violations.filter((v) => v.impact === 'critical')
    expect(critical).toEqual([])
  })

  test('verify view should have no critical a11y violations', async ({ page }) => {
    await page.getByRole('button', { name: /verify/i }).first().click()
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze()
    const critical = accessibilityScanResults.violations.filter((v) => v.impact === 'critical')
    expect(critical).toEqual([])
  })
})
