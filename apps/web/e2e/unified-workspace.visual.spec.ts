import { expect, test } from '@playwright/test';

/**
 * Layout and a11y visual gates for the unified workspace (plan 406 Task 14).
 * Uses DOM/geometry assertions so preview CSP stays `script-src 'self'` without unsafe-eval.
 * Does not claim pixel baselines or production readiness.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`UDW shell stays readable at ${viewport.name} without legacy primary nav`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile-chromium' && viewport.name !== 'mobile',
      'One project',
    );
    test.skip(testInfo.project.name === 'chromium' && viewport.name === 'mobile', 'Mobile project');
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/vi-VN/dashboards');

    const heading = page.locator('.dda-dashboard-header h2');
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(40);
    expect(box!.height).toBeGreaterThan(16);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);

    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
    if (viewport.name === 'mobile') {
      await page.getByRole('button', { name: 'Mở điều hướng' }).click();
    }
    await expect(nav.getByRole('link', { name: 'Bảng điều khiển' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Phân tích' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Dữ liệu' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Hộp thư đến' })).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'Mở trợ lý biểu đồ' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi-VN');
  });
}

test('analysis surface has no duplicate floating agent control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop visual gate');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/vi-VN/analysis');
  await expect(page.getByRole('heading', { name: 'Phân tích' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở trợ lý biểu đồ' })).toHaveCount(0);
});

test('preview CSP stays strict while UDW routes render', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop CSP gate');
  const response = await page.goto('/en/data');
  const policy = response?.headers()['content-security-policy'];
  expect(policy?.split(';').map((directive) => directive.trim())).toContain("script-src 'self'");
  expect(policy).not.toContain('unsafe-eval');
  await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible();
});
