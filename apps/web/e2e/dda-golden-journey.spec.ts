import { expect, test } from '@playwright/test';

/**
 * Golden mentor-demo journey (prototype): messy sales → reviewed dashboard.
 * Honest limits: dashboard authoring remains partly fixture-backed.
 * CSP stays strict (`script-src 'self'` without unsafe-eval); chart paths must use
 * non-eval renderers. Not a production claim.
 */
test.describe('DDA golden messy-sales journey', () => {
  test('Vietnamese-first dashboards surface freshness and evidence limits', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/vi-VN/dashboards');
    await expect(page.getByRole('heading', { name: 'Bảng điều khiển' })).toBeVisible();
    await expect(page.getByText(/Freshness|Độ mới|freshness/i)).toBeVisible();
    await expect(page.getByText(/Evidence|Bằng chứng|authorization/i)).toBeVisible();
  });

  test('English locale keeps governed ask and publish controls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/en/dashboards');
    await expect(page.getByRole('heading', { name: 'Dashboards' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ask governed data' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add widget' })).toBeVisible();
  });

  test('streaming labels are absent from the authoring chrome', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/en/dashboards');
    await expect(page.getByText(/streaming|real-time|realtime/i)).toHaveCount(0);
  });
});
