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
  'foundation-reconciliation-2026-08-02.md',
);

test('foundation reconciliation records every approved foundation task and gate', () => {
  assert.ok(existsSync(evidencePath), 'reconciliation evidence file is missing');
  const evidence = readFileSync(evidencePath, 'utf8');

  assert.match(evidence, /^# Engineering Foundation Reconciliation$/mu);
  assert.match(
    evidence,
    /\*\*Source commit:\*\* `86e72d8569057d2a14ed6bb1672ce6a573fa8d7c` \(display prefix: `86e72d8`\)/u,
  );
  assert.match(evidence, /\*\*Requirement status:\*\* no requirement promoted to `verified`/u);
  for (let taskNumber = 1; taskNumber <= 23; taskNumber += 1) {
    assert.match(evidence, new RegExp(`\\| Task ${taskNumber} \\|`, 'u'));
  }
  for (const requiredSection of [
    '## Reconciliation method',
    '## Task outcomes',
    '## Fresh verification evidence',
    '## Known environment limits',
    '## Release and rollback decision',
  ]) {
    assert.match(evidence, new RegExp(`^${requiredSection}$`, 'mu'));
  }
  assert.match(evidence, /No AWS infrastructure was applied/u);
  assert.match(evidence, /No customer data or credentials were used/u);
});
