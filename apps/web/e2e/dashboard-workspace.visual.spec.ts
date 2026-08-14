/// <reference lib="dom" />

import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 1024, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const DASHBOARD_ROUTE = '/vi-VN/dashboards';

async function prepareDashboard(page: Page, viewport: (typeof VIEWPORTS)[number]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(DASHBOARD_ROUTE);
  await page.evaluate(async () => {
    await document.fonts?.ready;
  });
  await expect(page.getByRole('heading', { name: 'Bảng điều khiển', exact: true })).toBeVisible();
}

test.describe('responsive dashboard workspace evidence [DDA-026][DDA-033]', () => {
  for (const viewport of VIEWPORTS) {
    test(`keeps the Vietnamese workspace readable at ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'Exact evidence viewports run once');
      await prepareDashboard(page, viewport);

      await expect(page.locator('html')).toHaveAttribute('lang', 'vi-VN');
      await expect(
        page.getByRole('heading', { name: 'Tổng quan bán hàng', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mở trợ lý biểu đồ' })).toBeVisible();
      await expect(
        page.getByText('Giới hạn bằng chứng và quyền truy cập luôn được hiển thị.'),
      ).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        bodyScrollWidth: document.body.scrollWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
      expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);

      const widgets = page.locator('[data-widget-id]');
      await expect(widgets).toHaveCount(5);
      for (const widget of await widgets.all()) {
        const box = await widget.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      await page.screenshot({
        path: testInfo.outputPath(`dashboard-workspace-${viewport.name}.png`),
        fullPage: false,
      });
    });
  }

  test('data keeps dataset, source-file, OCR evidence, and its agent surface', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop evidence surface');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/vi-VN/data');
    await page.evaluate(async () => {
      await document.fonts?.ready;
    });

    await expect(page.getByRole('heading', { name: 'Dữ liệu', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Mở bộ dữ liệu: Bán hàng toàn quốc' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tệp nguồn', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Mở tệp nguồn: sales-august.xlsx' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Mở tệp nguồn: receipts-august.pdf' }),
    ).toBeVisible();
    await expect(page.getByText('18 ảnh gốc')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mở trợ lý' })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    await page.screenshot({
      path: testInfo.outputPath('data-dataset-source-evidence.png'),
      fullPage: false,
    });
  });

  test('analysis uses the full conversation surface without a duplicate floating agent', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop evidence surface');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/vi-VN/analysis');
    await page.evaluate(async () => {
      await document.fonts?.ready;
    });

    await expect(page.getByRole('heading', { name: 'Phân tích', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Luồng hội thoại' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nhập câu hỏi phân tích' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mở trợ lý' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mở trợ lý biểu đồ' })).toHaveCount(0);
  });

  test('preview keeps strict CSP while the governed routes render', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop security evidence');
    const response = await page.goto('/vi-VN/data');
    const policy = response?.headers()['content-security-policy'] ?? '';
    expect(policy.split(';').map((directive) => directive.trim())).toContain("script-src 'self'");
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).toContain("object-src 'none'");
    await expect(page.getByRole('heading', { name: 'Dữ liệu', exact: true })).toBeVisible();
  });
});
