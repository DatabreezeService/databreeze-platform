import { expect, test } from '@playwright/test';

test('dashboard authoring keeps evidence and freshness visible', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop authoring flow');
  await page.goto('/en/dashboards');
  await expect(page.getByRole('heading', { name: 'Dashboards' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ask governed data' })).toBeVisible();
  await expect(page.getByText(/Freshness/u)).toBeVisible();
  await expect(page.getByText(/Evidence and authorization limits remain visible/u)).toBeVisible();
  await page.getByRole('button', { name: 'Add widget' }).click();
  await expect(page.getByRole('heading', { name: 'Widget catalog' })).toBeVisible();
});

test('Vietnamese dashboard chrome is complete', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop locale check');
  await page.goto('/vi-VN/dashboards');
  await expect(page.getByRole('heading', { name: 'Bảng điều khiển' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm tiện ích' })).toBeVisible();
});
