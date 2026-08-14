import { expect, test } from '@playwright/test';

/**
 * Unified data workspace product E2E (plan 406 Task 14).
 * Asserts the three-section shell, auth entry, agent presence rules, and CSP discipline.
 * Not a production-readiness claim.
 */
test.describe('unified data workspace shell', () => {
  test('Vietnamese primary rail exposes exactly three destinations', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop UDW nav');
    await page.goto('/vi-VN/dashboards');

    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await expect(nav.getByRole('link', { name: 'Bảng điều khiển' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Phân tích' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Dữ liệu' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Hộp thư đến' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Jobs' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Tác vụ' })).toHaveCount(0);
  });

  test('English primary rail keeps the same three destinations', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop UDW nav');
    await page.goto('/en/dashboards');

    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(nav.getByRole('link', { name: 'Dashboards' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Analysis' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Data', exact: true })).toBeVisible();
  });

  test('workspace legacy path redirects into dashboards', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop redirect');
    await page.goto('/vi-VN/workspace');
    await expect(page).toHaveURL(/\/vi-VN\/dashboards$/u);
    await expect(page.getByRole('heading', { name: 'Bảng điều khiển' })).toBeVisible();
  });

  test('dashboard and data expose the floating agent; analysis does not', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop agent surfaces');
    await page.goto('/vi-VN/dashboards');
    await expect(page.getByRole('button', { name: 'Mở trợ lý biểu đồ' })).toBeVisible();

    await page.goto('/vi-VN/data');
    await expect(page.getByRole('heading', { name: 'Dữ liệu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mở trợ lý' })).toBeVisible();

    await page.goto('/vi-VN/analysis');
    await expect(page.getByRole('heading', { name: 'Phân tích' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mở trợ lý' })).toHaveCount(0);
  });

  test('signed-out auth routes render Vietnamese and English without keep-me-signed-in', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop auth routes');
    await page.goto('/vi-VN/sign-in');
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google' })).toBeVisible();
    await expect(page.getByText(/keep me signed in|duy trì đăng nhập/i)).toHaveCount(0);

    await page.goto('/en/register');
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
  });

  test('mobile navigation opens the three UDW destinations', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile UDW nav');
    await page.goto('/en/dashboards');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Data', exact: true })
      .click();
    await expect(page).toHaveURL(/\/en\/data$/u);
    await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible();
  });
});
