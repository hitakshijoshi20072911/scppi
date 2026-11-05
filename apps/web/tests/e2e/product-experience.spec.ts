import { test, expect } from '@playwright/test'

test('landing page exposes product entry points and honest API status', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Verified work/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /Run Free Demo/i }).first()).toBeVisible()
  await expect(page.getByText(/The demo works even when the API is offline/i)).toBeVisible()
  await expect(page.getByText(/Built with Swytchcode/i)).toBeVisible()
})

test('landing page advances through the dynamic product scenes while scrolling', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(() => window.scrollTo({ top: 2200, behavior: 'instant' }))
  await expect(page.getByText(/Product intelligence/i)).toBeVisible()
  await page.evaluate(() => window.scrollTo({ top: 5600, behavior: 'instant' }))
  await expect(page.getByText(/Live product model/i)).toBeVisible()
})

test('free demo is deterministic, interactive, and clearly fictional', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByRole('heading', { name: /See the proof chain/i })).toBeVisible()
  await expect(page.getByText(/fictional sample data/i).first()).toBeVisible()
  await page.getByRole('button', { name: /Start simulation/i }).click()
  await expect(page.getByRole('heading', { name: /Connect repository/i })).toBeVisible()
  await page.getByRole('button', { name: /Retrieve evidence/i }).click()
  await expect(page.getByText(/Add webhook retry handling/i)).toBeVisible()
  await page.getByRole('button', { name: /View demo notes/i }).click()
  await expect(page.getByText(/does not call the API client/i)).toBeVisible()
})
