import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const checkerPath = path.join(
  repositoryRoot,
  'tools',
  'repo-cli',
  'src',
  'check-execution-orchestration.mjs',
);

const expectedPlans = new Map([
  ['010', ['010-engineering-foundation.md', 0]],
  ['020', ['020-identity-audit-entitlements.md', 67]],
  ['030', ['030-artifacts-datasets-evidence.md', 47]],
  ['040', ['040-jobs-processing-approvals.md', 30]],
  ['050', ['050-devices-sync-offline.md', 76]],
  ['060', ['060-collaboration-integrations.md', 42]],
  ['070', ['070-dogfood-folder-spreadsheet.md', 0]],
  ['100', ['100-folder-autopilot.md', 34]],
  ['110', ['110-spreadsheet-auditor.md', 27]],
  ['120', ['120-quote-intelligence.md', 27]],
  ['130', ['130-operations-capture.md', 40]],
  ['200', ['200-invoice-leak-detector.md', 27]],
  ['210', ['210-client-report-factory.md', 27]],
  ['220', ['220-private-data-analyst.md', 37]],
  ['300', ['300-migration-ready.md', 32]],
  ['310', ['310-data-quality-guard.md', 35]],
  ['320', ['320-embedded-importer.md', 27]],
  ['400', ['400-production-readiness.md', 23]],
  ['500', ['500-post-ga-extensions.md', 13]],
]);

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
}

function assertAcyclic(plans) {
  const byId = new Map(plans.map((plan) => [plan.planId, plan]));
  const active = new Set();
  const complete = new Set();

  function visit(planId) {
    if (complete.has(planId)) return;
    assert.ok(!active.has(planId), `dependency cycle at ${planId}`);
    active.add(planId);
    for (const dependency of byId.get(planId).dependencies) visit(dependency);
    active.delete(planId);
    complete.add(planId);
  }

  for (const planId of byId.keys()) visit(planId);
}

function withTemporaryPlans(mutate, assertion) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'databreeze-orchestration-'));
  try {
    cpSync(path.join(repositoryRoot, 'docs', 'plans'), path.join(temporaryRoot, 'docs', 'plans'), {
      recursive: true,
    });
    const ledgerPath = path.join(temporaryRoot, 'docs', 'plans', 'execution-orchestration.json');
    const traceabilityPath = path.join(
      temporaryRoot,
      'docs',
      'plans',
      'requirement-traceability.json',
    );
    const state = {
      ledger: JSON.parse(readFileSync(ledgerPath, 'utf8')),
      traceability: JSON.parse(readFileSync(traceabilityPath, 'utf8')),
    };
    mutate(state);
    writeFileSync(ledgerPath, `${JSON.stringify(state.ledger, null, 2)}\n`);
    writeFileSync(traceabilityPath, `${JSON.stringify(state.traceability, null, 2)}\n`);
    const result = spawnSync(process.execPath, [checkerPath, '--root', temporaryRoot], {
      encoding: 'utf8',
    });
    assertion(result);
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

test('execution ledger covers the complete dependency-ordered implementation program', () => {
  const ledger = readJson('docs/plans/execution-orchestration.json');
  const traceability = readJson('docs/plans/requirement-traceability.json');
  const orchestration = readFileSync(
    path.join(repositoryRoot, 'docs', 'plans', '002-complete-execution-orchestration.md'),
    'utf8',
  );

  assert.equal(ledger.version, 1);
  assert.deepEqual(
    ledger.plans.map((plan) => plan.planId),
    [...expectedPlans.keys()],
  );
  assert.equal(ledger.requirementTotals.total, 611);
  assert.deepEqual(ledger.requirementTotals.byPriority, { P0: 444, P1: 154, P2: 13 });

  const traceCounts = traceability.requirements.reduce((counts, requirement) => {
    counts[requirement.primaryPlan] = (counts[requirement.primaryPlan] ?? 0) + 1;
    return counts;
  }, {});
  const taskIds = new Set();
  for (const plan of ledger.plans) {
    const [file, expectedRequirementCount] = expectedPlans.get(plan.planId);
    assert.equal(plan.file, file);
    assert.equal(plan.requirementCount, expectedRequirementCount);
    assert.equal(traceCounts[file] ?? 0, expectedRequirementCount);
    assert.ok(existsSync(path.join(repositoryRoot, 'docs', 'plans', file)));
    assert.ok(plan.taskIds.length > 0, `${plan.planId} task inventory`);
    for (const dependency of plan.dependencies) assert.ok(expectedPlans.has(dependency));
    for (const taskId of plan.taskIds) {
      assert.ok(!taskIds.has(taskId), `duplicate orchestration task ${taskId}`);
      taskIds.add(taskId);
      assert.match(orchestration, new RegExp(`^#### ${taskId} —`, 'm'));
    }
  }
  assertAcyclic(ledger.plans);
  assert.ok(taskIds.has(ledger.nextTaskId));
});

test('handoff policy preserves the requested dev and main review flow', () => {
  const ledger = readJson('docs/plans/execution-orchestration.json');
  assert.deepEqual(ledger.reviewPolicy.featurePullRequest, {
    base: 'dev',
    codeRabbit: false,
    mergeAfterHostedChecks: true,
  });
  assert.deepEqual(ledger.reviewPolicy.promotionPullRequest, {
    base: 'main',
    head: 'dev',
    codeRabbitInvocations: 1,
    requireFullReview: true,
    maximumFilesBeforeOpening: 280,
  });
  assert.deepEqual(ledger.reviewPolicy.commitBudget, {
    preferredMinimum: 30,
    preferredMaximum: 50,
    hardMaximum: 60,
  });
});

test('the handoff runbook contains deterministic resume and failure protocols', () => {
  const runbook = readFileSync(
    path.join(repositoryRoot, 'docs', 'plans', '003-luna-handoff-runbook.md'),
    'utf8',
  );
  for (const heading of [
    '## Start-of-session algorithm',
    '## Resume-state decision table',
    '## Atomic task execution loop',
    '## Pull-request and CodeRabbit protocol',
    '## Edge-case response matrix',
    '## End-of-session handoff record',
    '## Luna bootstrap prompt',
  ]) {
    assert.match(runbook, new RegExp(`^${heading}$`, 'm'));
  }
});

test('repository checker validates the committed orchestration package', () => {
  const result = spawnSync(process.execPath, [checkerPath, '--root', repositoryRoot], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"planCount":19/u);
  assert.match(result.stdout, /"requirementCount":611/u);
});

test('ledger records verified task evidence before advancing the next task', () => {
  const ledger = readJson('docs/plans/execution-orchestration.json');
  assert.equal(ledger.nextTaskId, 'FND-003');
  assert.equal(ledger.checkpoint.lastFeaturePullRequest, 13);
  assert.deepEqual(ledger.taskState?.['FND-001']?.status, 'verified');
  assert.match(ledger.taskState?.['FND-001']?.commit ?? '', /^[0-9a-f]{40}$/u);
  assert.ok(
    ledger.taskState['FND-001'].evidence.includes(
      'docs/operations/foundation-reconciliation-2026-08-02.md',
    ),
  );
  assert.deepEqual(ledger.taskState?.['FND-002']?.status, 'verified');
  assert.match(ledger.taskState?.['FND-002']?.commit ?? '', /^[0-9a-f]{40}$/u);
  assert.ok(
    ledger.taskState['FND-002'].evidence.includes(
      'docs/operations/foundation-android-2026-08-02.md',
    ),
  );
});

test('CodeRabbit promotion disposition records one review and rejected claims', () => {
  const disposition = readFileSync(
    path.join(repositoryRoot, 'docs', 'operations', 'code-review-11-disposition.md'),
    'utf8',
  );
  assert.match(disposition, /Promotion PR.*#11/u);
  assert.match(disposition, /one permitted full CodeRabbit review/u);
  assert.match(disposition, /Duplicate plan catalog/u);
  assert.match(disposition, /Docstring coverage warning/u);
});

test('repository checker rejects dependency cycles', () => {
  withTemporaryPlans(
    ({ ledger }) => {
      ledger.plans[0].dependencies = ['500'];
    },
    (result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /execution dependency cycle/u);
    },
  );
});

test('repository checker rejects false verified requirement evidence', () => {
  withTemporaryPlans(
    ({ traceability }) => {
      traceability.requirements[0].status = 'verified';
      traceability.requirements[0].testPaths = ['missing/tests'];
      traceability.requirements[0].releaseEvidence = ['missing/evidence.json'];
    },
    (result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /lacks exact existing test paths/u);
      assert.match(result.stderr, /lacks exact existing release-evidence paths/u);
    },
  );
});

test('repository checker rejects task evidence paths that escape the repository root', () => {
  withTemporaryPlans(
    ({ ledger }) => {
      ledger.taskState = {
        'FND-001': {
          status: 'verified',
          commit: '0'.repeat(40),
          evidence: ['..'],
        },
      };
    },
    (result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /verified task FND-001 has missing evidence paths/u);
    },
  );
});
