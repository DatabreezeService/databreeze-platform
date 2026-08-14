import { defineConfig, devices } from '@playwright/test';

const devPort = process.env['PLAYWRIGHT_DEV_PORT'] ?? '5173';
const browserChannel = process.env['PLAYWRIGHT_BROWSER_CHANNEL'];
const browser = browserChannel === 'chrome' ? { channel: 'chrome' as const } : {};

export default defineConfig({
  timeout: 30_000,
  globalTimeout: 120_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env['CI'] === 'true' ? 'github' : 'list',
  testDir: './e2e-dev',
  use: {
    baseURL: `http://127.0.0.1:${devPort}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `corepack pnpm dev --host 127.0.0.1 --port ${devPort} --strictPort`,
    env: { VITE_DATABREEZE_DEMO_MODE: 'true' },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${devPort}/en/workspace`,
  },
  projects: [{ name: 'development-chromium', use: { ...devices['Desktop Chrome'], ...browser } }],
});
