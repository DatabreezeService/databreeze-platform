import { expect, test } from '@playwright/test';

test('Vietnamese workspace exposes the governed table and core jobs navigation', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop locale smoke');
  await page.goto('/vi-VN/workspace');

  await expect(page.getByRole('heading', { name: 'Công việc cần xử lý' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Công việc cần xử lý' })).toBeVisible();
  await page.getByRole('link', { name: 'Tác vụ' }).click();
  await expect(page).toHaveURL(/\/vi-VN\/jobs$/u);
  await expect(page.getByRole('heading', { name: 'Tác vụ' })).toBeVisible();
});

test('English locale and locale switching preserve the logical route', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop locale smoke');
  await page.goto('/en/reports?scope=current');

  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await page.getByRole('link', { name: 'Tiếng Việt' }).click();
  await expect(page).toHaveURL(/\/vi-VN\/reports\?scope=current$/u);
});

test('mobile navigation opens and follows a core route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Representative responsive smoke');
  await page.goto('/en/workspace');

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Jobs' }).click();
  await expect(page).toHaveURL(/\/en\/jobs$/u);
});
