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

  await coordinator.saveRefresh({
    refreshId,
    tenantScope,
    dashboardId,
    dashboardVersionId,
    permissionProjectionVersionId,
    datasetVersionId: '00000000-0000-4000-8000-000000000018',
    definitionIds: [],
    inputSelectorHash: 'a'.repeat(64),
    sourceEventIds: [],
    clientRequestIds: [],
    folderReplayKeys: [],
    state: 'RUNNING',
    debounceWindowMs: 0,
    openedAtMs: 1,
    updatedAtMs: 1,
  });
  await coordinator.commitSnapshotAtomically({
    dashboardId,
    refreshId,
    snapshot: snapshot.value,
  });

  const current = await coordinator.getCurrentSnapshot(dashboardId);
  assert.equal(current?.snapshotId, snapshotId);
  const persisted = await repository.findSnapshot(tenantScope, snapshotId);
  assert.equal(persisted?.snapshotId, snapshotId);
  const state = await repository.findState(tenantScope, dashboardId);
  assert.equal(state?.lastSnapshotId, snapshotId);
  assert.equal(state?.status, 'COMMITTED');
});
