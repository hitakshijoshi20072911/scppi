import { test, expect } from '@playwright/test'

test('loads the VendorProof foundation page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Verified work/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Traceable invoices/i })).toBeVisible()
})
