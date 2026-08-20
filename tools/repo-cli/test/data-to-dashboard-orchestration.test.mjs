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
  assert.equal(output.workPackageCount, 16);
  assert.equal(output.requirementCount, 61);
  assert.equal(output.parallelLaneCount, 5);
  assert.equal(output.nextWorkPackageId, 'DDA-087');
  const ledger = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, 'docs', 'plans', 'data-to-dashboard-orchestration.json'),
      'utf8',
    ),
  );
  assert.equal(
    ledger.workPackages.find((item) => item.workPackageId === 'DDA-087')?.status,
    'complete',
  );
  assert.equal(ledger.gates.find((item) => item.gateId === 'G3')?.status, 'complete');
  assert.equal(ledger.gates.find((item) => item.gateId === 'G4')?.status, 'complete');
  assert.equal(ledger.gates.find((item) => item.gateId === 'G5')?.status, 'blocked');
});

test('DDA program keeps production and streaming claims out of the delivery gate', () => {
  const ledger = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, 'docs', 'plans', 'data-to-dashboard-orchestration.json'),
      'utf8',
    ),
  );
  const plan400 = readFileSync(
    path.join(repositoryRoot, 'docs', 'plans', '400-production-readiness.md'),
    'utf8',
  );
  const plan401 = readFileSync(
    path.join(repositoryRoot, 'docs', 'plans', '401-dda-production-readiness.md'),
    'utf8',
  );

  assert.match(plan400, /^### Task 1: WEB production control center$/m);
  assert.match(
    plan401,
    /^### Task 1: Freeze the production release manifest and evidence matrix$/m,
  );
  assert.equal(ledger.delivery.mode, 'task-gated-complete-program');
  assert.equal(ledger.delivery.productionReady, false);
  assert.equal(ledger.gates.find((gate) => gate.gateId === 'G5')?.status, 'blocked');
  assert.equal(
    ledger.gates.find((gate) => gate.gateId === 'G5')?.externalPlan,
    'docs/plans/401-dda-production-readiness.md',
  );
  assert.deepEqual(
    ledger.deferred.map((item) => item.requirementId),
    ['DDA-051'],
  );
});
