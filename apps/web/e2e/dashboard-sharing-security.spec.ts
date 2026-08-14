import { expect, test } from '@playwright/test';

test('dashboard sharing messaging never claims source permission expansion', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop sharing security');
  await page.goto('/en/dashboards');
  await expect(page.getByRole('heading', { name: 'Dashboards' })).toBeVisible();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /Evidence and authorization limits remain visible/u }),
  ).toBeVisible();
});
