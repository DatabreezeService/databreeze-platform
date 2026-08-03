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
  commitBudget: { hardMaximum: 79, preferredMaximum: 50, preferredMinimum: 30 },
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
const requiredExecutionPlanHeadings = [
  '## 1. Verified starting checkpoint',
  '## 3. Delivery-batch map',
  '## 4. Parallel execution and integration ownership',
  '## 5. Atomic task recipe',
  '## 6. PR and promotion algorithm',
  '## 7. First Luna Max session',
  '## 8. Completion and stop rules',
];
const batchChangedFileMaximum = 260;
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
  if (declaredPath.includes('\\')) return false;
  const segments = declaredPath.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) return false;
  const candidate = path.resolve(repositoryRoot, ...segments);
  const relative = path.relative(repositoryRoot, candidate);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
  return existsSync(candidate);
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

function validateDeliveryBatches({ ledger, plans, taskIds, taskToPlan, diagnostics }) {
  const batches = Array.isArray(ledger.deliveryBatches) ? ledger.deliveryBatches : [];
  const byId = new Map();
  const batchByTask = new Map();
  const handoffTaskIdsByBatch = new Map();

  for (const batch of batches) {
    if (typeof batch.batchId !== 'string' || batch.batchId.trim() === '') {
      diagnostics.push('delivery batch has no batchId');
      continue;
    }
    if (byId.has(batch.batchId)) diagnostics.push(`duplicate delivery batch ${batch.batchId}`);
    byId.set(batch.batchId, batch);
    if (!/^feat\/[a-z0-9-]+$|^fix\/[a-z0-9-]+$/u.test(batch.branch ?? '')) {
      diagnostics.push(`batch ${batch.batchId} has invalid branch ${batch.branch}`);
    }
    if (!ledger.statusVocabulary?.includes(batch.status)) {
      diagnostics.push(`batch ${batch.batchId} has unsupported status ${batch.status}`);
    }
    const budget = batch.commitBudget ?? {};
    if (!Number.isInteger(budget.minimum) || budget.minimum < 30) {
      diagnostics.push(`batch ${batch.batchId} commit minimum must be at least 30`);
    }
    if (
      !Number.isInteger(budget.target) ||
      budget.target < budget.minimum ||
      budget.target > budget.maximum
    ) {
      diagnostics.push(`batch ${batch.batchId} commit target is outside its budget`);
    }
    if (!Number.isInteger(budget.maximum) || budget.maximum > 79) {
      diagnostics.push(`batch ${batch.batchId} exceptional commit maximum must not exceed 79`);
    }
    if (
      !Number.isInteger(batch.maximumChangedFiles) ||
      batch.maximumChangedFiles < 1 ||
      batch.maximumChangedFiles > batchChangedFileMaximum
    ) {
      diagnostics.push(
        `batch ${batch.batchId} changed-file maximum must be between 1 and ${batchChangedFileMaximum}`,
      );
    }
    if (!Array.isArray(batch.taskIds) || batch.taskIds.length === 0) {
      diagnostics.push(`batch ${batch.batchId} has no tasks`);
      continue;
    }
    const rawHandoffTaskIds = batch.handoffTaskIds;
    const normalizedHandoffTaskIds =
      rawHandoffTaskIds === undefined
        ? []
        : Array.isArray(rawHandoffTaskIds)
          ? rawHandoffTaskIds
          : [];
    if (rawHandoffTaskIds !== undefined && !Array.isArray(rawHandoffTaskIds)) {
      diagnostics.push(`batch ${batch.batchId} handoffTaskIds must be an array`);
    }
    handoffTaskIdsByBatch.set(batch.batchId, normalizedHandoffTaskIds);
    const handoffTaskIds = new Set(normalizedHandoffTaskIds);
    for (const taskId of handoffTaskIds) {
      if (!batch.taskIds.includes(taskId)) {
        diagnostics.push(`batch ${batch.batchId} handoff task ${taskId} is not in taskIds`);
      }
    }
    for (const taskId of batch.taskIds) {
      if (!taskIds.has(taskId))
        diagnostics.push(`batch ${batch.batchId} has unknown task ${taskId}`);
      if (batchByTask.has(taskId)) {
        diagnostics.push(
          `task ${taskId} is assigned to both ${batchByTask.get(taskId)} and ${batch.batchId}`,
        );
      }
      batchByTask.set(taskId, batch.batchId);
    }
  }

  for (const batch of batches) {
    for (const dependency of batch.dependencies ?? []) {
      if (!byId.has(dependency)) {
        diagnostics.push(`batch ${batch.batchId} has unknown dependency ${dependency}`);
      }
    }
  }

  const active = new Set();
  const complete = new Set();
  function visit(batchId) {
    if (complete.has(batchId)) return;
    if (active.has(batchId)) {
      diagnostics.push(`delivery batch dependency cycle includes ${batchId}`);
      return;
    }
    active.add(batchId);
    for (const dependency of byId.get(batchId)?.dependencies ?? []) visit(dependency);
    active.delete(batchId);
    complete.add(batchId);
  }
  for (const batchId of byId.keys()) visit(batchId);

  const verifiedTasks = new Set(
    Object.entries(ledger.taskState ?? {})
      .filter(([, state]) => ['verified', 'released'].includes(state?.status))
      .map(([taskId]) => taskId),
  );
  for (const batch of batches) {
    for (const taskId of handoffTaskIdsByBatch.get(batch.batchId) ?? []) {
      if (!verifiedTasks.has(taskId)) {
        diagnostics.push(`batch ${batch.batchId} handoff task ${taskId} is not verified`);
      }
    }
  }
  for (const taskId of taskIds) {
    if (verifiedTasks.has(taskId)) {
      const batchId = batchByTask.get(taskId);
      if (batchId !== undefined && !handoffTaskIdsByBatch.get(batchId)?.includes(taskId)) {
        diagnostics.push(`verified task ${taskId} remains batched without handoff declaration`);
      }
    } else if (!batchByTask.has(taskId)) {
      diagnostics.push(`unfinished task ${taskId} has no delivery batch`);
    }
  }

  if (!byId.has(ledger.activeBatchId)) {
    diagnostics.push(`activeBatchId ${ledger.activeBatchId} is not a delivery batch`);
  } else if (!byId.get(ledger.activeBatchId).taskIds.includes(ledger.nextTaskId)) {
    diagnostics.push(
      `active batch ${ledger.activeBatchId} does not contain nextTaskId ${ledger.nextTaskId}`,
    );
  }

  function dependsOn(batchId, expectedDependency, seen = new Set()) {
    if (batchId === expectedDependency) return true;
    if (seen.has(batchId)) return false;
    seen.add(batchId);
    return (byId.get(batchId)?.dependencies ?? []).some((dependency) =>
      dependsOn(dependency, expectedDependency, seen),
    );
  }

  const planById = new Map(plans.map((plan) => [plan.planId, plan]));
  for (const [taskId, planId] of taskToPlan) {
    const consumerBatchId = batchByTask.get(taskId);
    if (consumerBatchId === undefined) continue;
    const consumerBatch = byId.get(consumerBatchId);
    for (const dependencyPlanId of planById.get(planId)?.dependencies ?? []) {
      const dependencyTaskIds = planById.get(dependencyPlanId)?.taskIds ?? [];
      for (const dependencyTaskId of dependencyTaskIds) {
        if (verifiedTasks.has(dependencyTaskId)) continue;
        const producerBatchId = batchByTask.get(dependencyTaskId);
        if (producerBatchId === undefined) continue;
        if (producerBatchId === consumerBatchId) {
          if (
            consumerBatch.taskIds.indexOf(dependencyTaskId) > consumerBatch.taskIds.indexOf(taskId)
          ) {
            diagnostics.push(
              `batch ${consumerBatchId} orders dependent task ${taskId} before ${dependencyTaskId}`,
            );
          }
        } else if (!dependsOn(consumerBatchId, producerBatchId)) {
          diagnostics.push(
            `batch ${consumerBatchId} containing ${taskId} does not depend on ${producerBatchId} containing ${dependencyTaskId}`,
          );
        }
      }
    }
  }
}

function run(argumentsList) {
  const { root } = parseOptions(argumentsList);
  const plansDirectory = path.join(root, 'docs', 'plans');
  const ledgerPath = path.join(plansDirectory, 'execution-orchestration.json');
  const traceabilityPath = path.join(plansDirectory, 'requirement-traceability.json');
  const orchestrationPath = path.join(plansDirectory, '002-complete-execution-orchestration.md');
  const runbookPath = path.join(plansDirectory, '003-luna-handoff-runbook.md');
  const executionPlanPath = path.join(plansDirectory, '004-luna-max-execution-plan.md');
  const requiredFiles = [
    ledgerPath,
    traceabilityPath,
    orchestrationPath,
    runbookPath,
    executionPlanPath,
  ];
  const missingFiles = requiredFiles.filter((filePath) => !existsSync(filePath));
  if (missingFiles.length > 0) {
    throw new Error(`Missing orchestration files:\n${missingFiles.join('\n')}`);
  }

  const ledger = readJson(ledgerPath);
  const traceability = readJson(traceabilityPath);
  const orchestration = readFileSync(orchestrationPath, 'utf8');
  const runbook = readFileSync(runbookPath, 'utf8');
  const executionPlan = readFileSync(executionPlanPath, 'utf8');
  const diagnostics = [];

  if (ledger.version !== 2) diagnostics.push(`unsupported ledger version ${ledger.version}`);
  if (ledger.authority?.deliveryBatches !== 'docs/plans/004-luna-max-execution-plan.md') {
    diagnostics.push('delivery-batch authority must point to the Luna Max execution plan');
  }
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
  const taskToPlan = new Map();
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
      taskToPlan.set(taskId, plan.planId);
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
  const taskState = ledger.taskState ?? {};
  if (taskState === null || typeof taskState !== 'object' || Array.isArray(taskState)) {
    diagnostics.push('taskState must be an object');
  } else {
    for (const [taskId, state] of Object.entries(taskState)) {
      if (!taskIds.has(taskId)) {
        diagnostics.push(`taskState contains unknown task ${taskId}`);
        continue;
      }
      if (state === null || typeof state !== 'object' || Array.isArray(state)) {
        diagnostics.push(`taskState for ${taskId} must be an object`);
        continue;
      }
      if (!ledger.statusVocabulary?.includes(state.status)) {
        diagnostics.push(`task ${taskId} has unsupported status ${state.status}`);
      }
      if (['verified', 'released'].includes(state.status)) {
        if (!/^[0-9a-f]{40}$/u.test(state.commit ?? '')) {
          diagnostics.push(`verified task ${taskId} must name a full commit SHA`);
        }
        if (!Array.isArray(state.evidence) || state.evidence.length === 0) {
          diagnostics.push(`verified task ${taskId} must name evidence paths`);
        } else if (!state.evidence.every((entry) => pathExists(root, entry))) {
          diagnostics.push(`verified task ${taskId} has missing evidence paths`);
        }
      }
    }
  }
  validateDeliveryBatches({ ledger, plans, taskIds, taskToPlan, diagnostics });
  for (const heading of requiredRunbookHeadings) {
    if (!runbook.split(/\r?\n/u).includes(heading))
      diagnostics.push(`runbook heading missing: ${heading}`);
  }
  for (const heading of requiredExecutionPlanHeadings) {
    if (!executionPlan.split(/\r?\n/u).includes(heading)) {
      diagnostics.push(`Luna Max execution plan heading missing: ${heading}`);
    }
  }
  for (const batch of ledger.deliveryBatches ?? []) {
    const documentedRow = `| \`${batch.batchId}\` | \`${batch.branch}\` |`;
    if (!executionPlan.includes(documentedRow)) {
      diagnostics.push(
        `Luna Max execution plan does not document ${batch.batchId} on ${batch.branch}`,
      );
    }
  }

  if (diagnostics.length > 0) {
    process.stderr.write(`${diagnostics.sort().join('\n')}\n`);
    return 1;
  }

  process.stdout.write(
    `${JSON.stringify({
      nextTaskId: ledger.nextTaskId,
      activeBatchId: ledger.activeBatchId,
      batchCount: ledger.deliveryBatches.length,
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
