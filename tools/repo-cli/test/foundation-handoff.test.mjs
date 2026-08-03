import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidencePath = path.join(
  repositoryRoot,
  'docs',
  'operations',
  'foundation-handoff-2026-08-03.md',
);

test('foundation handoff records the current checkpoint and preserves unresolved gates', () => {
  assert.ok(existsSync(evidencePath), 'foundation handoff evidence file is missing');
  const evidence = readFileSync(evidencePath, 'utf8');

  assert.match(evidence, /^# Engineering foundation handoff$/mu);
  for (const requiredSection of [
    '## Current checkpoint',
    '## Verification record',
    '## Explicit external gates',
    '## B01 resume point',
    '## Rollback points',
  ]) {
    assert.match(evidence, new RegExp(`^${requiredSection}$`, 'mu'));
  }
  assert.match(evidence, /origin\/dev.*9265e15/iu);
  assert.match(evidence, /FND-005/iu);
  assert.match(evidence, /FND-006/iu);
  assert.match(evidence, /IAM-001/iu);
  assert.match(evidence, /No customer data.*credentials/isu);
});
