import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeDashboardSnapshotHashV1,
  createDashboardSnapshotV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryRefreshCoordinatorAdapter } from '../../../src/features/dda/refresh/adapter/in-memory-refresh-coordinator.adapter.js';
import { RefreshOrchestratorService } from '../../../src/features/dda/refresh/application/refresh-orchestrator.service.js';
import { SnapshotCommitService } from '../../../src/features/dda/refresh/application/snapshot-commit.service.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('id');
  return parsed.value;
}

const ids = {
  dashboardId: id('00000000-0000-4000-8000-000000000401'),
  dashboardVersionId: id('00000000-0000-4000-8000-000000000402'),
  snapshot: id('00000000-0000-4000-8000-000000000403'),
  matA: id('00000000-0000-4000-8000-000000000404'),
  permission: id('00000000-0000-4000-8000-000000000405'),
  dataset: id('00000000-0000-4000-8000-000000000406'),
  defA: id('00000000-0000-4000-8000-000000000407'),
};

function snapshot(snapshotId: StableIdentifierV1) {
  const createdAtResult = parseStrictUtcTimestampV1('2026-08-10T10:00:00.000Z');
  assert.equal(createdAtResult.accepted, true);
  if (!createdAtResult.accepted) throw new Error('ts');
  const input = {
    snapshotId,
    tenantScope: scope,
    dashboardVersionId: ids.dashboardVersionId,
    materializationIds: [ids.matA],
    inputSelectorHash: 'a'.repeat(64),
    permissionProjectionVersionId: ids.permission,
    audience: 'PROJECT_VIEWERS' as const,
    freshnessState: 'FRESH' as const,
    evidenceState: 'AVAILABLE' as const,
    createdAt: createdAtResult.value,
  };
  const canonicalHash = computeDashboardSnapshotHashV1(input);
  const created = createDashboardSnapshotV1({ ...input, canonicalHash });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('snapshot');
  return created.value;
}

function trigger(overrides: Record<string, unknown> = {}) {
  return {
    sourceEventId: '00000000-0000-4000-8000-000000000411',
    tenantScope: scope,
    dashboardId: ids.dashboardId,
    dashboardVersionId: ids.dashboardVersionId,
    permissionProjectionVersionId: ids.permission,
    datasetVersionId: ids.dataset,
    definitionIds: [ids.defA],
    inputSelectorHash: 'a'.repeat(64),
    debounceWindowMs: 60_000,
    occurredAtMs: 1_000,
    clientRequestId: 'client-1',
    folderReplayKey: 'folder-1',
    ...overrides,
  };
}

void test('[DDA-030] duplicate events, worker/client retries, and folder replay are idempotent', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(ids.dashboardId, snapshot(ids.snapshot));
  const orchestrator = new RefreshOrchestratorService(
    coordinator,
    new SnapshotCommitService(coordinator),
  );

  const first = await orchestrator.acceptTrigger(trigger());
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.value.state, 'PENDING');

  for (const retry of [
    trigger(),
    trigger({ clientRequestId: 'client-1' }),
    trigger({ folderReplayKey: 'folder-1' }),
    trigger({ workerAttempt: 2 }),
  ]) {
    const replayed = await orchestrator.acceptTrigger(retry);
    assert.equal(replayed.accepted, true);
    if (!replayed.accepted) continue;
    assert.equal(replayed.value.refreshId, first.value.refreshId);
    assert.equal(replayed.value.idempotentReplay, true);
  }
});

void test('[DDA-030] compatible changes coalesce inside debounce window and keep final input set', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(ids.dashboardId, snapshot(ids.snapshot));
  const orchestrator = new RefreshOrchestratorService(
    coordinator,
    new SnapshotCommitService(coordinator),
  );

  const first = await orchestrator.acceptTrigger(
    trigger({
      sourceEventId: '00000000-0000-4000-8000-000000000421',
      occurredAtMs: 1_000,
      inputSelectorHash: 'a'.repeat(64),
    }),
  );
  const second = await orchestrator.acceptTrigger(
    trigger({
      sourceEventId: '00000000-0000-4000-8000-000000000422',
      occurredAtMs: 1_500,
      inputSelectorHash: 'b'.repeat(64),
      clientRequestId: 'client-2',
      folderReplayKey: 'folder-2',
    }),
  );
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (!first.accepted || !second.accepted) return;
  assert.equal(second.value.refreshId, first.value.refreshId);
  assert.equal(second.value.coalesced, true);
  assert.equal(second.value.inputSelectorHash, 'b'.repeat(64));
  assert.deepEqual(second.value.sourceEventIds, [
    '00000000-0000-4000-8000-000000000421',
    '00000000-0000-4000-8000-000000000422',
  ]);
});

void test('[DDA-030] incompatible permission/definition/input sets never coalesce', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(ids.dashboardId, snapshot(ids.snapshot));
  const orchestrator = new RefreshOrchestratorService(
    coordinator,
    new SnapshotCommitService(coordinator),
  );
  const first = await orchestrator.acceptTrigger(trigger({ occurredAtMs: 1_000 }));
  const incompatible = await orchestrator.acceptTrigger(
    trigger({
      sourceEventId: '00000000-0000-4000-8000-000000000431',
      occurredAtMs: 1_200,
      permissionProjectionVersionId: '00000000-0000-4000-8000-000000000499',
      clientRequestId: 'client-x',
      folderReplayKey: 'folder-x',
    }),
  );
  assert.equal(first.accepted, true);
  assert.equal(incompatible.accepted, true);
  if (!first.accepted || !incompatible.accepted) return;
  assert.notEqual(incompatible.value.refreshId, first.value.refreshId);
  assert.equal(incompatible.value.coalesced, false);
});

void test('[DDA-030] lease expiry and crash recovery keep explicit refresh states and last-good snapshot', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(ids.dashboardId, snapshot(ids.snapshot));
  const orchestrator = new RefreshOrchestratorService(
    coordinator,
    new SnapshotCommitService(coordinator),
  );
  const accepted = await orchestrator.acceptTrigger(trigger());
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;

  const running = await orchestrator.markRunning(accepted.value.refreshId, 'lease-1');
  assert.equal(running.accepted, true);

  const expired = await orchestrator.handleLeaseExpiry(accepted.value.refreshId, 'lease-1');
  assert.equal(expired.accepted, true);
  if (!expired.accepted) return;
  assert.equal(expired.value.state, 'PENDING');

  const afterDispatchCrash = await orchestrator.recoverAfterCrash(
    accepted.value.refreshId,
    'AFTER_JOB_DISPATCH',
  );
  assert.equal(afterDispatchCrash.accepted, true);
  if (!afterDispatchCrash.accepted) return;
  assert.equal(afterDispatchCrash.value.state, 'RUNNING');

  const afterVerifyCrash = await orchestrator.recoverAfterCrash(
    accepted.value.refreshId,
    'AFTER_RESULT_VERIFICATION',
  );
  assert.equal(afterVerifyCrash.accepted, true);
  if (!afterVerifyCrash.accepted) return;
  assert.equal(afterVerifyCrash.value.state, 'VERIFYING');

  const duringCommitCrash = await orchestrator.recoverAfterCrash(
    accepted.value.refreshId,
    'DURING_SNAPSHOT_COMMIT',
  );
  assert.equal(duringCommitCrash.accepted, true);
  if (!duringCommitCrash.accepted) return;
  assert.equal(duringCommitCrash.value.state, 'FAILED');
  assert.equal((await coordinator.getCurrentSnapshot(ids.dashboardId))?.snapshotId, ids.snapshot);
});
