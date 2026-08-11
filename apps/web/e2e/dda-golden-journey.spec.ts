import { expect, test } from '@playwright/test';

/**
 * Golden mentor-demo journey: messy sales → reviewed dashboard chrome.
 * Core authoring chrome is available without VITE_DATABREEZE_DEMO_MODE.
 * Fixture KPI numbers remain demo-only; live mode fail-closes without inventing values.
 * CSP stays strict (`script-src 'self'` without unsafe-eval). Not a production claim.
 */
test.describe('DDA golden messy-sales journey', () => {
  test('Vietnamese-first dashboards surface freshness and evidence limits', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/vi-VN/dashboards');
    await expect(page.getByRole('heading', { name: 'Bảng điều khiển' })).toBeVisible();
    await expect(page.getByTestId('dashboard-freshness')).toBeVisible();
    await expect(page.getByTestId('dashboard-evidence-warning')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hỏi dữ liệu có kiểm soát' })).toBeVisible();
  });

  test('English locale keeps governed ask and publish controls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/en/dashboards');
    await expect(page.getByRole('heading', { name: 'Dashboards' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ask governed data' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add widget' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();
  });

  test('intake and ETL review surface is composed on reviews without demo mode', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/en/reviews');
    await expect(page.getByRole('heading', { name: 'Intake and ETL review' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ETL review' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue to dashboards' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept ETL proposal' })).toBeDisabled();
  });

  test('streaming labels are absent from the authoring chrome', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/en/dashboards');
    await expect(page.getByText(/streaming|real-time|realtime/i)).toHaveCount(0);
  });

  test('demo KPI fixture numbers stay gated behind explicit demo mode', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    test.skip(
      process.env['VITE_DATABREEZE_DEMO_MODE'] === 'true',
      'Demo mode intentionally renders fixture KPI numbers.',
    );
    await page.goto('/en/dashboards');
    await expect(page.getByText('1,250,000 VND')).toHaveCount(0);
  });
});
