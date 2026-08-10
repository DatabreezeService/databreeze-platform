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
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryRefreshCoordinatorAdapter } from '../../../src/features/dda/refresh/adapter/in-memory-refresh-coordinator.adapter.js';
import { DashboardRefreshController } from '../../../src/features/dda/refresh/api/dashboard-refresh.controller.js';
import { FreshnessService } from '../../../src/features/dda/refresh/application/freshness.service.js';

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('id');
  return parsed.value;
}

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

const ids = {
  dashboardId: id('00000000-0000-4000-8000-000000000501'),
  dashboardVersionId: id('00000000-0000-4000-8000-000000000502'),
  snapshot: id('00000000-0000-4000-8000-000000000503'),
  matA: id('00000000-0000-4000-8000-000000000504'),
  permission: id('00000000-0000-4000-8000-000000000505'),
};

function snapshot(permissionProjectionVersionId: StableIdentifierV1 = ids.permission) {
  const createdAtResult = parseStrictUtcTimestampV1('2026-08-10T10:00:00.000Z');
  assert.equal(createdAtResult.accepted, true);
  if (!createdAtResult.accepted) throw new Error('ts');
  const input = {
    snapshotId: ids.snapshot,
    tenantScope: scope,
    dashboardVersionId: ids.dashboardVersionId,
    materializationIds: [ids.matA],
    inputSelectorHash: 'a'.repeat(64),
    permissionProjectionVersionId,
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

function controller(coordinator: InMemoryRefreshCoordinatorAdapter) {
  return new DashboardRefreshController(new FreshnessService(coordinator));
}

void test('[DDA-027, DDA-033] freshness reports CURRENT policy states and last-good snapshot', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(ids.dashboardId, snapshot());
  const result = await controller(coordinator).getFreshness(
    {
      tenantScope: scope,
      authorizedPermissionProjectionVersionId: ids.permission,
      nowMs: Date.parse('2026-08-10T10:01:00.000Z'),
    },
    ids.dashboardId,
  );
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.freshnessState, 'CURRENT');
  assert.equal(result.value.freshnessPolicy, 'ON_CHANGE');
  assert.equal(result.value.lastGoodSnapshotId, ids.snapshot);
  assert.equal(result.value.inputSelectorHash, 'a'.repeat(64));
  assert.equal(result.value.resultCompleteness, 'COMPLETE');
});

void test('[DDA-033] permission revocation, source unavailable, retention, and pending age are visible', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(ids.dashboardId, snapshot());
  const freshness = new FreshnessService(coordinator);
  const http = new DashboardRefreshController(freshness);

  const revoked = await http.getFreshness(
    {
      tenantScope: scope,
      authorizedPermissionProjectionVersionId: id('00000000-0000-4000-8000-000000000599'),
      nowMs: Date.parse('2026-08-10T10:01:00.000Z'),
    },
    ids.dashboardId,
  );
  assert.equal(revoked.accepted, false);
  if (revoked.accepted) return;
  assert.equal(revoked.code, 'PERMISSION_REVOKED');

  await freshness.markSourceCondition(ids.dashboardId, {
    kind: 'SOURCE_UNAVAILABLE',
    reasonCode: 'DEVICE_OFFLINE',
  });
  const unavailable = await http.getFreshness(
    {
      tenantScope: scope,
      authorizedPermissionProjectionVersionId: ids.permission,
      nowMs: Date.parse('2026-08-10T10:01:00.000Z'),
    },
    ids.dashboardId,
  );
  assert.equal(unavailable.accepted, true);
  if (!unavailable.accepted) return;
  assert.equal(unavailable.value.freshnessState, 'SOURCE_UNAVAILABLE');
  assert.equal(unavailable.value.reasonCode, 'DEVICE_OFFLINE');
  assert.equal(unavailable.value.lastGoodSnapshotId, ids.snapshot);

  await freshness.markSourceCondition(ids.dashboardId, {
    kind: 'BLOCKED',
    reasonCode: 'RETENTION_EXPIRED',
  });
  const blocked = await http.getFreshness(
    {
      tenantScope: scope,
      authorizedPermissionProjectionVersionId: ids.permission,
      nowMs: Date.parse('2026-08-10T10:01:00.000Z'),
    },
    ids.dashboardId,
  );
  assert.equal(blocked.accepted, true);
  if (!blocked.accepted) return;
  assert.equal(blocked.value.freshnessState, 'BLOCKED');
  assert.equal(blocked.value.reasonCode, 'RETENTION_EXPIRED');

  await freshness.markPending(ids.dashboardId, Date.parse('2026-08-10T10:00:00.000Z'));
  const pending = await http.getFreshness(
    {
      tenantScope: scope,
      authorizedPermissionProjectionVersionId: ids.permission,
      nowMs: Date.parse('2026-08-10T10:00:45.000Z'),
    },
    ids.dashboardId,
  );
  assert.equal(pending.accepted, true);
  if (!pending.accepted) return;
  assert.equal(pending.value.freshnessState, 'PENDING');
  assert.equal(pending.value.pendingDurationMs, 45_000);
  assert.equal(pending.value.lastGoodSnapshotId, ids.snapshot);
});

void test('[DDA-033] stale state keeps last-good visibility with exact input versions', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(ids.dashboardId, snapshot());
  const freshness = new FreshnessService(coordinator);
  const http = new DashboardRefreshController(freshness);
  await freshness.markSourceCondition(ids.dashboardId, {
    kind: 'STALE',
    reasonCode: 'NEWER_DATASET_ACCEPTED',
  });
  const result = await http.getFreshness(
    {
      tenantScope: scope as TenantScopeV1,
      authorizedPermissionProjectionVersionId: ids.permission,
      nowMs: Date.parse('2026-08-10T10:05:00.000Z'),
    },
    ids.dashboardId,
  );
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.freshnessState, 'STALE');
  assert.equal(result.value.dashboardVersionId, ids.dashboardVersionId);
  assert.equal(result.value.permissionProjectionVersionId, ids.permission);
  assert.equal(result.value.lastGoodSnapshotId, ids.snapshot);
});
