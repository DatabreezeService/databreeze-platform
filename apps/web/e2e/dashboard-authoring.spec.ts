/// <reference lib="dom" />

import { expect, test } from '@playwright/test';

const DASHBOARD_ROUTE = '/vi-VN/dashboards';
const HISTORY_STORAGE_KEY = 'databreeze.dashboardHistoryCollapsed=v1';

test.describe('governed dashboard authoring [DDA-026][DDA-033][WEB-014]', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith('chromium'),
      'Runs once at the exact desktop viewport',
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(DASHBOARD_ROUTE);
    await page.evaluate((key) => localStorage.removeItem(key), HISTORY_STORAGE_KEY);
    await page.reload();
    await page.evaluate(async () => {
      await document.fonts?.ready;
    });
    await expect(page.getByRole('heading', { name: 'Bảng điều khiển', exact: true })).toBeVisible();
  });

  test('keeps the invitation closed or open without losing governed canvas context', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'Mở trợ lý biểu đồ' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Trợ lý biểu đồ' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Mở trợ lý biểu đồ' }).click();
    await expect(page.getByRole('dialog', { name: 'Trợ lý biểu đồ' })).toBeVisible();
    await expect(page.getByText('Mục tiêu: Tổng quan bán hàng')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Tổng quan bán hàng', exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Đóng trợ lý biểu đồ' }).click();
    await expect(page.getByRole('dialog', { name: 'Trợ lý biểu đồ' })).toHaveCount(0);
  });

  test('renders compatible proposal alternatives without publication controls', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Mở trợ lý biểu đồ' }).click();
    await page
      .getByRole('textbox', { name: 'Câu hỏi cho trợ lý biểu đồ' })
      .fill('Doanh thu theo khu vực');
    await page.getByRole('button', { name: 'Tạo đề xuất biểu đồ' }).click();

    await expect(page.getByRole('heading', { name: 'Đề xuất biểu đồ tương thích' })).toBeVisible();
    await expect(page.getByRole('listbox', { name: 'Các đề xuất biểu đồ' })).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Thêm 0 biểu đồ vào canvas' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Publish|Template|Export/i })).toHaveCount(0);
    await expect(page.getByText(/Publish|Template|Export/i)).toHaveCount(0);
  });

  test('persists history collapse and restores it through the compact workspace toggle', async ({
    page,
  }) => {
    const history = page.getByRole('complementary', { name: 'Lịch sử phân tích' });
    await expect(history).toBeVisible();
    await page.getByRole('button', { name: 'Thu gọn lịch sử phân tích' }).click();
    await expect(history).toBeHidden();
    await expect(page.getByRole('button', { name: 'Mở lịch sử phân tích' })).toBeVisible();

    await page.reload();
    await expect(history).toBeHidden();
    await page.getByRole('button', { name: 'Mở lịch sử phân tích' }).click();
    await expect(history).toBeVisible();
    await page.evaluate((key) => localStorage.removeItem(key), HISTORY_STORAGE_KEY);
  });
});
