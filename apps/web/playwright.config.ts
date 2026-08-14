import { defineConfig, devices } from '@playwright/test';

const previewPort = process.env['PLAYWRIGHT_PREVIEW_PORT'] ?? '4173';
const browserChannel = process.env['PLAYWRIGHT_BROWSER_CHANNEL'];
const browser = browserChannel === 'chrome' ? { channel: 'chrome' as const } : {};
const previewCommand =
  process.env['PLAYWRIGHT_SKIP_BUILD'] === 'true'
    ? `corepack pnpm preview --host 127.0.0.1 --port ${previewPort} --strictPort`
    : `corepack pnpm build && corepack pnpm preview --host 127.0.0.1 --port ${previewPort} --strictPort`;

export default defineConfig({
  timeout: 30_000,
  globalTimeout: 300_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env['CI'] === 'true' ? 'github' : 'list',
  testDir: './e2e',
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: previewCommand,
    env: { VITE_DATABREEZE_DEMO_MODE: 'true' },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${previewPort}/vi-VN/dashboards`,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...browser } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], ...browser } },
  ],
});
