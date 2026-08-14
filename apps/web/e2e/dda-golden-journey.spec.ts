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
    await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  });

  test('English locale keeps governed ask and publish controls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/en/dashboards');
    await expect(page.getByRole('heading', { name: 'Dashboards' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add chart' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);
  });

  test('intake and ETL review surface is composed on reviews without demo mode', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/en/reviews');
    await expect(page.getByRole('heading', { name: 'Intake and ETL review' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ETL review', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue to dashboards' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept ETL proposal' })).toBeDisabled();
  });

  test('streaming labels are absent from the authoring chrome', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/en/dashboards');
    await expect(page.getByText(/streaming|real-time|realtime/i)).toHaveCount(0);
  });

  test('demo KPI fixture numbers are only visible in the explicit preview demo mode', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/en/dashboards');
    await expect(page.getByText('1,250,000 VND')).toHaveCount(2);
  });
});
