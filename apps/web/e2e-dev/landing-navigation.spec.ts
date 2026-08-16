import { expect, test } from '@playwright/test';

const landingAnchors = [
  { label: 'Sản phẩm', id: 'flow' },
  { label: 'AI có kiểm chứng', id: 'intelligence' },
  { label: 'Chế độ dữ liệu', id: 'modes' },
] as const;

test('landing navigation reveals and offsets each destination [WEB-013/WEB-014]', async ({
  page,
}) => {
  await page.goto('/vi-VN');

  const headerHeight = await page
    .locator('[data-header]')
    .evaluate((element) => Math.round(element.getBoundingClientRect().height));

  for (const { label, id } of landingAnchors) {
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));

    const destination = page.locator(`#${id}`);
    await expect(destination.locator('[data-reveal]').first()).toHaveClass(/is-visible/);
    await expect
      .poll(() =>
        destination.evaluate((element) => Math.round(element.getBoundingClientRect().top)),
      )
      .toBeGreaterThanOrEqual(headerHeight);
  }
});

test('landing header explore link offsets the product scene [WEB-013/WEB-014]', async ({
  page,
}) => {
  await page.goto('/vi-VN');

  const headerHeight = await page
    .locator('[data-header]')
    .evaluate((element) => Math.round(element.getBoundingClientRect().height));

  await page.locator('a.header-cta').filter({ hasText: 'Khám phá' }).click();
  await expect(page).toHaveURL(/#experience$/);

  const destination = page.locator('#experience');
  await expect(destination).toBeVisible();
  await expect
    .poll(() => destination.evaluate((element) => Math.round(element.getBoundingClientRect().top)))
    .toBeGreaterThanOrEqual(headerHeight);
});
