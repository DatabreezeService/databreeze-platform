import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluateDogfoodSkeleton } from '../src/check-dogfood-skeleton.mjs';

const requiredFiles = [
  'apps/web/src/features/spreadsheet-auditor/spreadsheet-audit-page.tsx',
  'services/api/src/features/iae/api/local-artifact-registration.controller.ts',
  'services/api/src/features/sa/api/spreadsheet-audit-run.controller.ts',
  'services/engine/src/databreeze_engine/processors/spreadsheet_auditor_action.py',
];

function fixtureRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'databreeze-dogfood-'));
  for (const file of requiredFiles) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'dogfood fixture', 'utf8');
  }
  return root;
}

void test('dogfood gate accepts the complete walking skeleton', () => {
  const result = evaluateDogfoodSkeleton(fixtureRoot());
  assert.deepEqual(result, { accepted: true, missing: [] });
});

void test('dogfood gate reports missing vertical components', () => {
  const root = fixtureRoot();
  const missing = requiredFiles[1];
  unlinkSync(path.join(root, missing));
  const result = evaluateDogfoodSkeleton(root);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.missing, [missing]);
});
