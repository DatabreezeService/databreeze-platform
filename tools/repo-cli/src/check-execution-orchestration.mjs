import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
const expectedPriorityTotals = { P0: 444, P1: 154, P2: 13 };
const expectedReviewPolicy = {
  commitBudget: { hardMaximum: 60, preferredMaximum: 50, preferredMinimum: 30 },
  featurePullRequest: { base: 'dev', codeRabbit: false, mergeAfterHostedChecks: true },
  promotionPullRequest: {
    base: 'main',
    codeRabbitInvocations: 1,
    head: 'dev',
    maximumFilesBeforeOpening: 280,
    requireFullReview: true,
  },
};
const requiredRunbookHeadings = [
  '## Start-of-session algorithm',
  '## Resume-state decision table',
  '## Atomic task execution loop',
  '## Pull-request and CodeRabbit protocol',
  '## Edge-case response matrix',
  '## End-of-session handoff record',
  '## Luna bootstrap prompt',
];
const traceStatuses = new Set(['planned', 'partial', 'implemented', 'verified', 'released']);

function parseOptions(argumentsList) {
  let root = path.resolve(import.meta.dirname, '..', '..', '..');
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument !== '--root') throw new Error(`Unknown option: ${argument}`);
    const value = argumentsList[index + 1];
    if (value === undefined) throw new Error('The --root option requires a value.');
    root = path.resolve(value);
    index += 1;
  }
  return { root };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJson(entry)]),
    );
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function pathExists(repositoryRoot, declaredPath) {
  if (typeof declaredPath !== 'string' || declaredPath.trim() === '') return false;
  if (/[{}*?]/u.test(declaredPath)) return false;
  return existsSync(path.join(repositoryRoot, ...declaredPath.split('/')));
}

function validateDag(plans, diagnostics) {
  const byId = new Map(plans.map((plan) => [plan.planId, plan]));
  const active = new Set();
  const complete = new Set();

  function visit(planId) {
    if (complete.has(planId)) return;
    if (active.has(planId)) {
      diagnostics.push(`execution dependency cycle includes ${planId}`);
      return;
    }
    active.add(planId);
    for (const dependency of byId.get(planId)?.dependencies ?? []) {
      if (!byId.has(dependency)) {
        diagnostics.push(`plan ${planId} has unknown dependency ${dependency}`);
      } else {
        visit(dependency);
      }
    }
    active.delete(planId);
    complete.add(planId);
  }

  for (const planId of byId.keys()) visit(planId);
}

function run(argumentsList) {
  const { root } = parseOptions(argumentsList);
  const plansDirectory = path.join(root, 'docs', 'plans');
  const ledgerPath = path.join(plansDirectory, 'execution-orchestration.json');
  const traceabilityPath = path.join(plansDirectory, 'requirement-traceability.json');
  const orchestrationPath = path.join(plansDirectory, '002-complete-execution-orchestration.md');
  const runbookPath = path.join(plansDirectory, '003-luna-handoff-runbook.md');
  const requiredFiles = [ledgerPath, traceabilityPath, orchestrationPath, runbookPath];
  const missingFiles = requiredFiles.filter((filePath) => !existsSync(filePath));
  if (missingFiles.length > 0) {
    throw new Error(`Missing orchestration files:\n${missingFiles.join('\n')}`);
  }

  const ledger = readJson(ledgerPath);
  const traceability = readJson(traceabilityPath);
  const orchestration = readFileSync(orchestrationPath, 'utf8');
  const runbook = readFileSync(runbookPath, 'utf8');
  const diagnostics = [];

  if (ledger.version !== 1) diagnostics.push(`unsupported ledger version ${ledger.version}`);
  if (!sameJson(ledger.reviewPolicy, expectedReviewPolicy)) {
    diagnostics.push('reviewPolicy does not preserve the approved dev/main/CodeRabbit flow');
  }
  if (ledger.requirementTotals?.total !== 611) {
    diagnostics.push(
      `ledger requirement total is ${ledger.requirementTotals?.total}; expected 611`,
    );
  }
  if (!sameJson(ledger.requirementTotals?.byPriority, expectedPriorityTotals)) {
    diagnostics.push('ledger priority totals differ from P0=444, P1=154, P2=13');
  }

  const plans = Array.isArray(ledger.plans) ? ledger.plans : [];
  const actualPlanIds = plans.map((plan) => plan.planId);
  if (!sameJson(actualPlanIds, [...expectedPlans.keys()])) {
    diagnostics.push('plan IDs or ordering differ from the approved 19-plan sequence');
  }

  const requirements = Array.isArray(traceability.requirements) ? traceability.requirements : [];
  const requirementIds = new Set();
  const priorityCounts = { P0: 0, P1: 0, P2: 0 };
  const primaryPlanCounts = new Map();
  for (const requirement of requirements) {
    if (requirementIds.has(requirement.requirementId)) {
      diagnostics.push(`duplicate requirement ${requirement.requirementId}`);
    }
    requirementIds.add(requirement.requirementId);
    if (!(requirement.priority in priorityCounts)) {
      diagnostics.push(
        `requirement ${requirement.requirementId} has invalid priority ${requirement.priority}`,
      );
    } else {
      priorityCounts[requirement.priority] += 1;
    }
    primaryPlanCounts.set(
      requirement.primaryPlan,
      (primaryPlanCounts.get(requirement.primaryPlan) ?? 0) + 1,
    );
    if (!traceStatuses.has(requirement.status)) {
      diagnostics.push(
        `requirement ${requirement.requirementId} has invalid status ${requirement.status}`,
      );
    }
    if (['verified', 'released'].includes(requirement.status)) {
      const testPaths = Array.isArray(requirement.testPaths) ? requirement.testPaths : [];
      const evidencePaths = Array.isArray(requirement.releaseEvidence)
        ? requirement.releaseEvidence
        : [];
      if (testPaths.length === 0 || !testPaths.every((entry) => pathExists(root, entry))) {
        diagnostics.push(
          `verified requirement ${requirement.requirementId} lacks exact existing test paths`,
        );
      }
      if (evidencePaths.length === 0 || !evidencePaths.every((entry) => pathExists(root, entry))) {
        diagnostics.push(
          `verified requirement ${requirement.requirementId} lacks exact existing release-evidence paths`,
        );
      }
    }
  }
  if (requirements.length !== 611)
    diagnostics.push(`traceability has ${requirements.length} requirements`);
  if (!sameJson(priorityCounts, expectedPriorityTotals)) {
    diagnostics.push(`traceability priority totals are ${JSON.stringify(priorityCounts)}`);
  }

  const planIds = new Set();
  const planFiles = new Set();
  const taskIds = new Set();
  for (const plan of plans) {
    if (planIds.has(plan.planId)) diagnostics.push(`duplicate plan ${plan.planId}`);
    planIds.add(plan.planId);
    if (planFiles.has(plan.file)) diagnostics.push(`duplicate plan file ${plan.file}`);
    planFiles.add(plan.file);

    const expected = expectedPlans.get(plan.planId);
    if (expected === undefined) continue;
    const [expectedFile, expectedRequirementCount] = expected;
    if (plan.file !== expectedFile) {
      diagnostics.push(`plan ${plan.planId} file is ${plan.file}; expected ${expectedFile}`);
    }
    if (plan.requirementCount !== expectedRequirementCount) {
      diagnostics.push(
        `plan ${plan.planId} owns ${plan.requirementCount}; expected ${expectedRequirementCount}`,
      );
    }
    if ((primaryPlanCounts.get(plan.file) ?? 0) !== expectedRequirementCount) {
      diagnostics.push(
        `traceability assigns ${primaryPlanCounts.get(plan.file) ?? 0} requirements to ${plan.file}; expected ${expectedRequirementCount}`,
      );
    }
    const childPlanPath = path.join(plansDirectory, plan.file);
    if (!existsSync(childPlanPath) || statSync(childPlanPath).size === 0) {
      diagnostics.push(`plan ${plan.planId} child file is missing or empty: ${plan.file}`);
    }
    if (!ledger.statusVocabulary?.includes(plan.status)) {
      diagnostics.push(`plan ${plan.planId} has unsupported status ${plan.status}`);
    }
    if (!Array.isArray(plan.taskIds) || plan.taskIds.length === 0) {
      diagnostics.push(`plan ${plan.planId} has no task inventory`);
      continue;
    }
    for (const taskId of plan.taskIds) {
      if (taskIds.has(taskId)) diagnostics.push(`duplicate orchestration task ${taskId}`);
      taskIds.add(taskId);
      const heading = new RegExp(`^#### ${escapeRegExp(taskId)} —`, 'mu');
      if (!heading.test(orchestration)) {
        diagnostics.push(`orchestration heading is missing for task ${taskId}`);
      }
    }
  }

  validateDag(plans, diagnostics);
  if (!taskIds.has(ledger.nextTaskId)) {
    diagnostics.push(`nextTaskId ${ledger.nextTaskId} is not in the task inventory`);
  }
  for (const heading of requiredRunbookHeadings) {
    if (!runbook.split(/\r?\n/u).includes(heading))
      diagnostics.push(`runbook heading missing: ${heading}`);
  }

  if (diagnostics.length > 0) {
    process.stderr.write(`${diagnostics.sort().join('\n')}\n`);
    return 1;
  }

  process.stdout.write(
    `${JSON.stringify({
      nextTaskId: ledger.nextTaskId,
      planCount: plans.length,
      requirementCount: requirements.length,
      taskCount: taskIds.size,
    })}\n`,
  );
  return 0;
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
