import { defineConfig, devices } from '@playwright/test';

const localBrowser = process.env['CI'] === 'true' ? {} : { channel: 'chrome' as const };

export default defineConfig({
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: process.env['CI'] === 'true' ? 'github' : 'list',
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'corepack pnpm build && corepack pnpm preview --host 127.0.0.1 --port 4173',
    reuseExistingServer: process.env['CI'] !== 'true',
    timeout: 120_000,
    url: 'http://127.0.0.1:4173/vi-VN/workspace',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...localBrowser } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], ...localBrowser } },
  ],
});
