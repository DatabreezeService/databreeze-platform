import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const fixtureDir = path.resolve(
  process.cwd(),
  '../../tools/fixture-validation/fixtures/dda/unified-workspace',
);

void test('[UDW-JOURNEY] synthetic unified workspace fixture stays provider-free', () => {
  const manifest = JSON.parse(readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8')) as {
    expectations: { providerCalls: number; governedRowCount: number };
    restrictedMemberPreset: string;
  };
  const csv = readFileSync(path.join(fixtureDir, 'synthetic-vi-expenses.csv'), 'utf8');
  const rows = csv.trim().split(/\r?\n/u).slice(1);

  assert.equal(manifest.expectations.providerCalls, 0);
  assert.equal(manifest.expectations.governedRowCount, rows.length);
  assert.equal(manifest.restrictedMemberPreset, 'Viewer');
  assert.match(csv, /an_uong/u);
});
