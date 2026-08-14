import { expect, test } from '@playwright/test';

test('Vietnamese workspace redirects into dashboards with UDW nav', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop locale smoke');
  await page.goto('/vi-VN/workspace');

  await expect(page).toHaveURL(/\/vi-VN\/dashboards$/u);
  await expect(page.getByRole('heading', { name: 'Bảng điều khiển' })).toBeVisible();
  await page.getByRole('link', { name: 'Phân tích' }).click();
  await expect(page).toHaveURL(/\/vi-VN\/analysis$/u);
  await expect(page.getByRole('heading', { name: 'Phân tích' })).toBeVisible();
});

test('English locale and locale switching preserve the logical route', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop locale smoke');
  await page.goto('/en/data?scope=current');

  await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible();
  await page.getByRole('link', { name: 'Tiếng Việt' }).click();
  await expect(page).toHaveURL(/\/vi-VN\/data\?scope=current$/u);
});

test('mobile navigation opens and follows a UDW route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Representative responsive smoke');
  await page.goto('/en/dashboards');

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Analysis' }).click();
  await expect(page).toHaveURL(/\/en\/analysis$/u);
});

test('compact shell keeps workspace context visible without a global search strip', async ({
  page,
}) => {
  await page.goto('/en/dashboards');
  await expect(page.getByText('Governed Workspace')).toBeVisible();
  await expect(page.getByRole('search')).toHaveCount(0);
});
