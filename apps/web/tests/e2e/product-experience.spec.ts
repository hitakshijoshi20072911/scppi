import { test, expect } from '@playwright/test'

test('landing page exposes product entry points and honest API status', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Verified work/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /Run Free Demo/i }).first()).toBeVisible()
  await expect(page.getByText(/The demo works even when the API is offline/i)).toBeVisible()
  await expect(page.getByText(/Built with Swytchcode/i)).toBeVisible()
  await expect(page.getByText(/One clear boundary/i)).toBeVisible()
  await expect(
    page.getByRole('link', { name: /official Swytchcode documentation/i }),
  ).toHaveAttribute('href', 'https://docs.swytchcode.com/')
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

test('free demo supports pause, resume, replay, reset, and step navigation', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Start simulation/i }).click()
  await expect(page.getByRole('button', { name: /Pause/i })).toBeVisible()
  await page.getByRole('button', { name: /Pause/i }).click()
  await expect(page.getByRole('button', { name: /Resume/i })).toBeVisible()
  await page.getByRole('button', { name: /Reset/i }).click()
  await expect(page.getByRole('heading', { name: /Ready when you are/i })).toBeVisible()
  await page.getByRole('button', { name: /Reconciliation result/i }).click()
  await expect(page.getByText(/No invoice created/i)).toBeVisible()
})

test('protected workspace routes redirect unauthenticated visitors to sign in', async ({
  page,
}) => {
  await page.goto('/app/integrations')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: /Return to your workspace/i })).toBeVisible()
})
