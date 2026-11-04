import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3001', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run dev -- --port 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
