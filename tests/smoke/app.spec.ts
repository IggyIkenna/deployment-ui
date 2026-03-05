import { test, expect } from '@playwright/test'

test.describe('App', () => {
  test('should load home page', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/.+/)
  })
})
