import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const checkerPath = path.join(
  repositoryRoot,
  'tools',
  'repo-cli',
  'src',
  'check-data-to-dashboard-orchestration.mjs',
);

test('DDA orchestration covers every requirement with non-overlapping parallel ownership', () => {
  const result = spawnSync(process.execPath, [checkerPath, '--root', repositoryRoot], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.workPackageCount, 7);
  assert.equal(output.requirementCount, 51);
  assert.equal(output.parallelLaneCount, 5);
  assert.equal(output.nextWorkPackageId, 'DDA-082');
});

test('DDA program keeps production and streaming claims out of the prototype gate', () => {
  const ledger = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, 'docs', 'plans', 'data-to-dashboard-orchestration.json'),
      'utf8',
    ),
  );
  assert.equal(ledger.prototype.productionReady, false);
  assert.deepEqual(
    ledger.deferred.map((item) => item.requirementId),
    ['DDA-051'],
  );
});
