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
  'foundation-telemetry-diagnostics-2026-08-03.md',
);

test('telemetry reconciliation records cross-runtime evidence and open environment gates', () => {
  assert.ok(existsSync(evidencePath), 'telemetry reconciliation evidence file is missing');
  const evidence = readFileSync(evidencePath, 'utf8');

  assert.match(evidence, /^# Foundation telemetry and diagnostics reconciliation$/mu);
  for (const requiredSection of [
    '## Scope and safety boundary',
    '## Cross-runtime verification',
    '## Failure and privacy probes',
    '## Known environment limits',
    '## Release decision',
  ]) {
    assert.match(evidence, new RegExp(`^${requiredSection}$`, 'mu'));
  }
  assert.match(evidence, /TypeScript.*Python.*Kotlin/isu);
  assert.match(evidence, /provider cause/iu);
  assert.match(evidence, /Android SDK/iu);
  assert.match(evidence, /No requirement record was promoted to `verified`/u);
});
