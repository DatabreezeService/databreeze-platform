import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureManifest = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../tools/fixture-validation/fixtures/dda/unified-workspace/manifest.json',
);

test('unified workspace golden fixture remains provider-free', () => {
  const manifest = JSON.parse(readFileSync(fixtureManifest, 'utf8')) as {
    expectations: { providerCalls: number };
  };
  expect(manifest.expectations.providerCalls).toBe(0);
});
