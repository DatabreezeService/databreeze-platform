import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../tools/fixture-validation/fixtures/dda/unified-workspace',
);
const fixtureManifest = path.join(fixtureDir, 'manifest.json');

test.describe('unified workspace golden journey', () => {
  test('fixture remains provider-free and complete', () => {
    const manifest = JSON.parse(readFileSync(fixtureManifest, 'utf8')) as {
      expectations: { providerCalls: number; localCloudParity: boolean };
      artifacts: Record<string, string>;
      journeySteps: readonly string[];
      restrictedMemberPreset: string;
    };
    expect(manifest.expectations.providerCalls).toBe(0);
    expect(manifest.expectations.localCloudParity).toBe(true);
    expect(manifest.restrictedMemberPreset).toBe('Viewer');
    expect(manifest.journeySteps).toEqual(
      expect.arrayContaining([
        'starter-dashboard',
        'agent-analysis',
        'viewer-denial',
        'provider-outage-fallback',
      ]),
    );
    for (const relativePath of Object.values(manifest.artifacts)) {
      const absolute = path.join(fixtureDir, relativePath);
      expect(existsSync(absolute)).toBe(true);
      expect(createHash('sha256').update(readFileSync(absolute)).digest('hex')).toMatch(
        /^[a-f0-9]{64}$/u,
      );
    }
  });

  test('Web surfaces the three destinations and agent rules for the journey', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop golden journey');
    await page.goto('/vi-VN/dashboards');
    await expect(page.getByRole('heading', { name: 'Bảng điều khiển' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mở trợ lý' })).toBeVisible();

    await page.getByRole('link', { name: 'Phân tích' }).click();
    await expect(page.getByRole('heading', { name: 'Phân tích' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mở trợ lý' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Dữ liệu' }).click();
    await expect(page.getByRole('heading', { name: 'Dữ liệu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mở trợ lý' })).toBeVisible();
  });
});
