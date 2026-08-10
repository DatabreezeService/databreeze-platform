import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseOptions(argumentsList) {
  let root = path.resolve(import.meta.dirname, '..', '..', '..');
  for (let index = 0; index < argumentsList.length; index += 1) {
    if (argumentsList[index] !== '--root')
      throw new Error(`Unknown option: ${argumentsList[index]}`);
    if (argumentsList[index + 1] === undefined)
      throw new Error('The --root option requires a value.');
    root = path.resolve(argumentsList[index + 1]);
    index += 1;
  }
  return { root };
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function normalizeDeclaredPath(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  if (value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/u.test(value)) return undefined;
  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../'))
    return undefined;
  return normalized.replace(/\/$/u, '');
}

function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function sameStringSet(left, right) {
  return (
    left.length === new Set(left).size &&
    right.length === new Set(right).size &&
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
  );
}

function validateDag(items, idKey, dependencyKey, diagnostics, label) {
  const byId = new Map(items.map((item) => [item[idKey], item]));
  const active = new Set();
  const complete = new Set();

  function visit(id) {
    if (complete.has(id)) return;
    if (active.has(id)) {
      diagnostics.push(`${label} dependency cycle includes ${id}`);
      return;
    }
    active.add(id);
    for (const dependency of byId.get(id)?.[dependencyKey] ?? []) {
      if (!byId.has(dependency))
        diagnostics.push(`${label} ${id} has unknown dependency ${dependency}`);
      else visit(dependency);
    }
    active.delete(id);
    complete.add(id);
  }

  for (const id of byId.keys()) visit(id);
}

function check() {
  const { root } = parseOptions(process.argv.slice(2));
  const ledgerPath = 'docs/plans/data-to-dashboard-orchestration.json';
  const ledger = readJson(root, ledgerPath);
  const index = readJson(root, 'docs/specs/requirement-index.json');
  const diagnostics = [];
  const statuses = new Set(ledger.statusVocabulary ?? []);
  const workPackages = Array.isArray(ledger.workPackages) ? ledger.workPackages : [];
  const packagesById = new Map();

  if (ledger.version !== 1) diagnostics.push('DDA orchestration version must be 1');
  if (ledger.program !== 'data-to-dashboard-v1') diagnostics.push('unexpected DDA program name');
  if (ledger.delivery?.mode !== 'task-gated-complete-program') {
    diagnostics.push('DDA delivery mode must be task-gated-complete-program');
  }
  if (ledger.delivery?.targetClaim !== 'production-after-g5-evidence') {
    diagnostics.push('DDA target claim must remain production-after-g5-evidence');
  }
  if (ledger.delivery?.productionReady !== false) {
    diagnostics.push('DDA must not be marked production ready before G5 evidence is accepted');
  }
  if (
    !Array.isArray(ledger.delivery?.goldenJourney) ||
    ledger.delivery.goldenJourney.length === 0
  ) {
    diagnostics.push('DDA delivery must declare at least one golden journey');
  }
  for (const authorityPath of Object.values(ledger.authority ?? {})) {
    const normalized = normalizeDeclaredPath(authorityPath);
    if (normalized === undefined || !existsSync(path.join(root, normalized))) {
      diagnostics.push(`missing DDA authority path ${authorityPath}`);
    }
  }

  const allTasks = new Set();
  const assignedRequirements = new Map();
  for (const workPackage of workPackages) {
    const id = workPackage.workPackageId;
    if (typeof id !== 'string' || !/^DDA-08[1-7]$/u.test(id)) {
      diagnostics.push(`invalid DDA work package id ${id}`);
      continue;
    }
    if (packagesById.has(id)) diagnostics.push(`duplicate DDA work package ${id}`);
    packagesById.set(id, workPackage);
    if (!statuses.has(workPackage.status))
      diagnostics.push(`${id} has unsupported status ${workPackage.status}`);

    const plan = normalizeDeclaredPath(workPackage.plan);
    if (plan === undefined || !existsSync(path.join(root, plan))) {
      diagnostics.push(`${id} has missing plan ${workPackage.plan}`);
      continue;
    }
    const planBody = readFileSync(path.join(root, plan), 'utf8');
    const declaredRequirements =
      planBody.match(/^\*\*Requirements:\*\* .*$/mu)?.[0]?.match(/DDA-\d{3}/gu) ?? [];
    const primaryRequirements = [
      ...planBody.matchAll(/^\*\*Primary requirements?:\*\* .*$/gmu),
    ].flatMap((match) => match[0].match(/DDA-\d{3}/gu) ?? []);
    if (!sameStringSet(declaredRequirements, workPackage.requirements ?? [])) {
      diagnostics.push(`${id} plan requirement header differs from its work package`);
    }
    if (!sameStringSet(primaryRequirements, workPackage.requirements ?? [])) {
      diagnostics.push(`${id} primary task requirements differ from its work package`);
    }
    for (const task of workPackage.tasks ?? []) {
      if (allTasks.has(`${id}:${task}`)) diagnostics.push(`${id} has duplicate task ${task}`);
      allTasks.add(`${id}:${task}`);
      const escaped = task.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      if (!new RegExp(`^### ${escaped}$`, 'mu').test(planBody)) {
        diagnostics.push(`${id} plan does not contain ${task}`);
      }
    }
    for (const requirementId of workPackage.requirements ?? []) {
      if (assignedRequirements.has(requirementId)) {
        diagnostics.push(
          `${requirementId} is assigned to both ${assignedRequirements.get(requirementId)} and ${id}`,
        );
      }
      assignedRequirements.set(requirementId, id);
    }
    const normalizedPaths = [];
    for (const declaredPath of workPackage.writePaths ?? []) {
      const normalized = normalizeDeclaredPath(declaredPath);
      if (normalized === undefined) diagnostics.push(`${id} has unsafe write path ${declaredPath}`);
      else normalizedPaths.push(normalized);
    }
    workPackage.__normalizedWritePaths = normalizedPaths;
  }

  validateDag(workPackages, 'workPackageId', 'dependsOn', diagnostics, 'work package');

  const expectedRequirements = new Set(
    index.requirements.filter((item) => item.id.startsWith('DDA-')).map((item) => item.id),
  );
  for (const requirementId of expectedRequirements) {
    if (!assignedRequirements.has(requirementId))
      diagnostics.push(`unassigned DDA requirement ${requirementId}`);
  }
  for (const requirementId of assignedRequirements.keys()) {
    if (!expectedRequirements.has(requirementId))
      diagnostics.push(`unknown DDA requirement ${requirementId}`);
  }

  const parallelGroups = Map.groupBy(
    workPackages.filter((item) => item.parallelGroup !== null),
    (item) => item.parallelGroup,
  );
  for (const [group, members] of parallelGroups) {
    for (let leftIndex = 0; leftIndex < members.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
        const left = members[leftIndex];
        const right = members[rightIndex];
        for (const leftPath of left.__normalizedWritePaths) {
          for (const rightPath of right.__normalizedWritePaths) {
            if (pathsOverlap(leftPath, rightPath)) {
              diagnostics.push(
                `${group} write ownership overlaps: ${left.workPackageId} ${leftPath} and ${right.workPackageId} ${rightPath}`,
              );
            }
          }
        }
      }
    }
  }

  const gates = Array.isArray(ledger.gates) ? ledger.gates : [];
  const gateIds = new Set();
  for (const gate of gates) {
    if (gateIds.has(gate.gateId)) diagnostics.push(`duplicate DDA gate ${gate.gateId}`);
    gateIds.add(gate.gateId);
    if (!statuses.has(gate.status))
      diagnostics.push(`${gate.gateId} has unsupported status ${gate.status}`);
    for (const workPackageId of gate.workPackageIds ?? []) {
      if (!packagesById.has(workPackageId))
        diagnostics.push(`${gate.gateId} has unknown work package ${workPackageId}`);
    }
    if (gate.externalPlan !== undefined) {
      const externalPlan = normalizeDeclaredPath(gate.externalPlan);
      if (externalPlan === undefined || !existsSync(path.join(root, externalPlan))) {
        diagnostics.push(`${gate.gateId} has missing external plan ${gate.externalPlan}`);
      }
    }
  }
  validateDag(gates, 'gateId', 'dependsOn', diagnostics, 'gate');

  if (!packagesById.has(ledger.nextWorkPackageId)) {
    diagnostics.push(`unknown nextWorkPackageId ${ledger.nextWorkPackageId}`);
  } else if (packagesById.get(ledger.nextWorkPackageId).status !== 'ready') {
    const next = packagesById.get(ledger.nextWorkPackageId);
    const awaitingProductionGate =
      next.status === 'complete' &&
      ledger.nextWorkPackageId === 'DDA-087' &&
      gates.some(
        (gate) =>
          gate.gateId === 'G5' && gate.status === 'blocked' && gate.externalPlan !== undefined,
      );
    if (!awaitingProductionGate) {
      diagnostics.push(`nextWorkPackageId ${ledger.nextWorkPackageId} is not ready`);
    }
  }

  const integrationOrder = ledger.integrationOrder ?? [];
  if (
    integrationOrder.length !== workPackages.length ||
    new Set(integrationOrder).size !== workPackages.length ||
    integrationOrder.some((id) => !packagesById.has(id))
  ) {
    diagnostics.push('integrationOrder must contain every work package exactly once');
  }

  const deferred = new Set((ledger.deferred ?? []).map((item) => item.requirementId));
  if (!deferred.has('DDA-051')) diagnostics.push('DDA-051 must remain explicitly deferred');

  for (const workPackage of workPackages) delete workPackage.__normalizedWritePaths;

  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) console.error(diagnostic);
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify({
      ledger: ledgerPath,
      workPackageCount: workPackages.length,
      requirementCount: assignedRequirements.size,
      parallelLaneCount: workPackages.filter((item) => item.parallelGroup === 'DDA-G2').length,
      nextWorkPackageId: ledger.nextWorkPackageId,
    }),
  );
}

try {
  check();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
