import { expect, test } from '@playwright/test';

test('preview serves clickjacking protection as a response header', async ({ page }) => {
  const response = await page.goto('/en/workspace');
  const policy = response?.headers()['content-security-policy'];

  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy?.split(';').map((directive) => directive.trim())).toContain("script-src 'self'");
  expect(policy).not.toContain('unsafe-eval');
});

test('dashboard route renders safely under the strict preview CSP', async ({ page }) => {
  await page.goto('/en/dashboards');

  await expect(page.getByRole('heading', { name: 'Dashboards' })).toBeVisible();
  await expect(
    page.getByText('Dashboard data is not available. No changes were sent.'),
  ).toBeVisible();
});

test('the document does not advertise unsupported frame ancestors through meta CSP', async ({
  page,
}) => {
  await page.goto('/en/workspace');

  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy"][content*="frame-ancestors"]'),
  ).toHaveCount(0);
});

test('the preview refuses to render the workspace inside an iframe', async ({ page, baseURL }) => {
  await page.setContent(`<iframe title="embed probe" src="${baseURL}/en/workspace"></iframe>`);
  const frame = page.frameLocator('iframe[title="embed probe"]');

  await expect(frame.getByRole('heading', { name: 'Open governed work' })).toHaveCount(0);
});
