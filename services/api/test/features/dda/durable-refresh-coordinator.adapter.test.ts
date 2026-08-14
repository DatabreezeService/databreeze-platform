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

import { InMemoryRefreshRepositoryAdapter } from '../../../src/features/dda/adapter/in-memory-refresh-repository.adapter.js';
import { DurableRefreshCoordinatorAdapter } from '../../../src/features/dda/refresh/adapter/durable-refresh-coordinator.adapter.js';
import { withRefreshSnapshotBindingProof } from './refresh-snapshot-fixture.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('id');
  return parsed.value;
}

void test('[DDA-036] durable refresh coordinator persists committed snapshots atomically through repository', async () => {
  const repository = new InMemoryRefreshRepositoryAdapter();
  const coordinator = new DurableRefreshCoordinatorAdapter(repository);
  const dashboardId = id('00000000-0000-4000-8000-00000000001b');
  const refreshId = '00000000-0000-4000-8000-000000000050';
  const snapshotId = id('00000000-0000-4000-8000-000000000051');
  const materializationId = id('00000000-0000-4000-8000-000000000052');
  const permissionProjectionVersionId = id('00000000-0000-4000-8000-000000000053');
  const dashboardVersionId = id('00000000-0000-4000-8000-000000000011');
  const createdAtResult = parseStrictUtcTimestampV1('2026-08-10T10:00:00.000Z');
  assert.equal(createdAtResult.accepted, true);
  if (!createdAtResult.accepted) return;

  const input = {
    snapshotId,
    tenantScope,
    dashboardVersionId,
    materializationIds: [materializationId],
    inputSelectorHash: 'a'.repeat(64),
    permissionProjectionVersionId,
    audience: 'PROJECT_VIEWERS' as const,
    freshnessState: 'FRESH' as const,
    evidenceState: 'AVAILABLE' as const,
    createdAt: createdAtResult.value,
  };
  const snapshot = createDashboardSnapshotV1({
    ...input,
    canonicalHash: computeDashboardSnapshotHashV1(input),
  });
  assert.equal(snapshot.accepted, true);
  if (!snapshot.accepted) return;
  const snapshotWithProof = withRefreshSnapshotBindingProof(snapshot.value);

  await coordinator.saveRefresh({
    refreshId,
    tenantScope,
    dashboardId,
    dashboardVersionId,
    permissionProjectionVersionId,
    datasetVersionId: '00000000-0000-4000-8000-000000000018',
    definitionIds: [],
    inputSelectorHash: snapshotWithProof.inputSelectorHash,
    sourceEventIds: [],
    clientRequestIds: [],
    folderReplayKeys: [],
    state: 'VERIFYING',
    revision: 1,
    leaseId: 'lease-1',
    debounceWindowMs: 0,
    openedAtMs: 1,
    updatedAtMs: 1,
  });
  await coordinator.commitSnapshotAtomically({
    tenantScope,
    dashboardId,
    refreshId,
    expectedRevision: 1,
    expectedLeaseId: 'lease-1',
    expectedInputSelectorHash: snapshotWithProof.inputSelectorHash,
    snapshot: snapshotWithProof,
  });

  const current = await coordinator.getCurrentSnapshot(tenantScope, dashboardId);
  assert.equal(current?.snapshotId, snapshotId);
  const persisted = await repository.findSnapshot(tenantScope, snapshotId);
  assert.equal(persisted?.snapshotId, snapshotId);
  const state = await repository.findState(tenantScope, dashboardId);
  assert.equal(state?.lastSnapshotId, snapshotId);
  assert.equal(state?.status, 'COMMITTED');
});

void test('[DDA-036] restart reads a committed snapshot from durable state without an open execution', async () => {
  const repository = new InMemoryRefreshRepositoryAdapter();
  const first = new DurableRefreshCoordinatorAdapter(repository);
  const second = new DurableRefreshCoordinatorAdapter(repository);
  const dashboardId = id('00000000-0000-4000-8000-00000000001c');
  const snapshotId = id('00000000-0000-4000-8000-00000000005c');
  const materializationId = id('00000000-0000-4000-8000-00000000005d');
  const permissionProjectionVersionId = id('00000000-0000-4000-8000-00000000005e');
  const dashboardVersionId = id('00000000-0000-4000-8000-00000000005f');
  const createdAtResult = parseStrictUtcTimestampV1('2026-08-10T10:00:00.000Z');
  assert.equal(createdAtResult.accepted, true);
  if (!createdAtResult.accepted) return;
  const input = {
    snapshotId,
    tenantScope,
    dashboardVersionId,
    materializationIds: [materializationId],
    inputSelectorHash: 'c'.repeat(64),
    permissionProjectionVersionId,
    audience: 'PROJECT_VIEWERS' as const,
    freshnessState: 'FRESH' as const,
    evidenceState: 'AVAILABLE' as const,
    createdAt: createdAtResult.value,
  };
  const created = createDashboardSnapshotV1({
    ...input,
    canonicalHash: computeDashboardSnapshotHashV1(input),
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  await first.setCurrentSnapshot(
    tenantScope,
    dashboardId,
    withRefreshSnapshotBindingProof(created.value),
  );
  const current = await second.getCurrentSnapshot(tenantScope, dashboardId);
  assert.equal(current?.snapshotId, snapshotId);
});

void test('[DDA-036] an older verifying execution cannot overwrite a newer committed snapshot', async () => {
  const repository = new InMemoryRefreshRepositoryAdapter();
  const coordinator = new DurableRefreshCoordinatorAdapter(repository);
  const dashboardId = id('00000000-0000-4000-8000-00000000002c');
  const materializationId = id('00000000-0000-4000-8000-00000000002d');
  const permissionProjectionVersionId = id('00000000-0000-4000-8000-00000000002e');
  const dashboardVersionId = id('00000000-0000-4000-8000-00000000002f');
  const olderId = id('00000000-0000-4000-8000-000000000030');
  const newerId = id('00000000-0000-4000-8000-000000000031');
  function make(snapshotId: StableIdentifierV1, createdAt: string) {
    const timestamp = parseStrictUtcTimestampV1(createdAt);
    assert.equal(timestamp.accepted, true);
    if (!timestamp.accepted) throw new Error('timestamp');
    const input = {
      snapshotId,
      tenantScope,
      dashboardVersionId,
      materializationIds: [materializationId],
      inputSelectorHash: 'f'.repeat(64),
      permissionProjectionVersionId,
      audience: 'PROJECT_VIEWERS' as const,
      freshnessState: 'FRESH' as const,
      evidenceState: 'AVAILABLE' as const,
      createdAt: timestamp.value,
    };
    const created = createDashboardSnapshotV1({
      ...input,
      canonicalHash: computeDashboardSnapshotHashV1(input),
    });
    assert.equal(created.accepted, true);
    if (!created.accepted) throw new Error('snapshot');
    return withRefreshSnapshotBindingProof(created.value);
  }
  const older = make(olderId, '2026-08-10T10:00:00.000Z');
  const newer = make(newerId, '2026-08-11T10:00:00.000Z');
  const record = (refreshId: string) => ({
    refreshId,
    tenantScope,
    dashboardId,
    dashboardVersionId,
    permissionProjectionVersionId,
    datasetVersionId: '00000000-0000-4000-8000-000000000032',
    definitionIds: [],
    inputSelectorHash: older.inputSelectorHash,
    sourceEventIds: [],
    clientRequestIds: [],
    folderReplayKeys: [],
    state: 'VERIFYING' as const,
    revision: 1,
    leaseId: `lease-${refreshId}`,
    debounceWindowMs: 0,
    openedAtMs: 1,
    updatedAtMs: 1,
  });
  const olderRefreshId = '00000000-0000-4000-8000-000000000033';
  const newerRefreshId = '00000000-0000-4000-8000-000000000034';
  await coordinator.saveRefresh(record(olderRefreshId));
  await coordinator.saveRefresh(record(newerRefreshId));
  await coordinator.commitSnapshotAtomically({
    tenantScope,
    dashboardId,
    refreshId: newerRefreshId,
    expectedRevision: 1,
    expectedLeaseId: `lease-${newerRefreshId}`,
    expectedInputSelectorHash: newer.inputSelectorHash,
    snapshot: newer,
  });
  await assert.rejects(
    coordinator.commitSnapshotAtomically({
      tenantScope,
      dashboardId,
      refreshId: olderRefreshId,
      expectedRevision: 1,
      expectedLeaseId: `lease-${olderRefreshId}`,
      expectedInputSelectorHash: older.inputSelectorHash,
      snapshot: older,
    }),
    /DDA_REFRESH_COMMIT_STALE/u,
  );
  await coordinator.transitionRefresh({
    tenantScope,
    refreshId: olderRefreshId,
    dashboardId,
    expectedRevision: 1,
    expectedState: 'VERIFYING',
    expectedLeaseId: `lease-${olderRefreshId}`,
    nextState: 'SUPERSEDED',
    updatedAtMs: 2,
  });
  await assert.rejects(
    coordinator.commitSnapshotAtomically({
      tenantScope,
      dashboardId,
      refreshId: olderRefreshId,
      expectedRevision: 2,
      expectedLeaseId: `lease-${olderRefreshId}`,
      expectedInputSelectorHash: older.inputSelectorHash,
      snapshot: older,
    }),
    /DDA_REFRESH_COMMIT_STALE/u,
  );
  assert.equal(
    (await coordinator.getCurrentSnapshot(tenantScope, dashboardId))?.snapshotId,
    newerId,
  );
});
