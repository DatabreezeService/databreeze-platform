import { defineConfig, devices } from '@playwright/test';

const localBrowser = process.env['CI'] === 'true' ? {} : { channel: 'chrome' as const };

export default defineConfig({
  expect: { timeout: 5_000 },
  reporter: process.env['CI'] === 'true' ? 'github' : 'list',
  testDir: './e2e-dev',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'corepack pnpm dev --host 127.0.0.1 --port 5173 --strictPort',
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://127.0.0.1:5173/en/workspace',
  },
  projects: [
    { name: 'development-chromium', use: { ...devices['Desktop Chrome'], ...localBrowser } },
  ],
});
