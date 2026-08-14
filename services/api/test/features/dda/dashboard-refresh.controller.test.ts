import assert from 'node:assert/strict';
import test from 'node:test';

import { ForbiddenException } from '@nestjs/common';

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
import { DashboardRefreshController } from '../../../src/features/dda/refresh/api/dashboard-refresh.controller.js';
import { FreshnessService } from '../../../src/features/dda/refresh/application/freshness.service.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import type { DashboardPermissionProjectionPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-http-ports.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';
import { withRefreshSnapshotBindingProof } from './refresh-snapshot-fixture.js';

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

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-0000000000a1',
  tenantScope: scope,
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-0000000000c1',
  idempotencyKey: 'dashboard-refresh-controller',
});
assert.equal(contextResult.accepted, true);
const context = contextResult.accepted ? contextResult.value : (null as never);

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
  return withRefreshSnapshotBindingProof(created.value);
}

function requestContext(): RequestTenantContextPortV1 {
  return { resolve: () => Promise.resolve(context) };
}

function authorization(allowed = true): DashboardAuthorizationPortV1 {
  return {
    authorizeDashboardAction(input) {
      assert.equal(input.tenantScope, context.tenantScope);
      assert.equal(input.actorId, context.actorId);
      assert.equal(input.dashboardId, ids.dashboardId);
      assert.equal(input.action, 'VIEW');
      return Promise.resolve(Object.freeze({ allowed, grantsDatasetAccess: false }));
    },
    projectVisibleFields: () => Promise.resolve(Object.freeze([])),
  };
}

function projection(
  permissionProjectionVersionId: StableIdentifierV1 = ids.permission,
): DashboardPermissionProjectionPortV1 {
  return {
    resolve(input) {
      assert.equal(input.context, context);
      assert.equal(input.dashboardId, ids.dashboardId);
      return Promise.resolve(
        Object.freeze({ accepted: true as const, permissionProjectionVersionId }),
      );
    },
  };
}

function controller(
  coordinator: InMemoryRefreshCoordinatorAdapter,
  auth: DashboardAuthorizationPortV1 = authorization(),
  projectionPort: DashboardPermissionProjectionPortV1 = projection(),
  freshnessService: FreshnessService = new FreshnessService(coordinator),
) {
  return new DashboardRefreshController(freshnessService, requestContext(), auth, projectionPort);
}

void test('[DDA-027, DDA-033] freshness reports CURRENT policy states and last-good snapshot', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(scope, ids.dashboardId, snapshot());
  const result = await controller(coordinator).getFreshness({ query: {} }, ids.dashboardId);
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.freshnessState, 'CURRENT');
  assert.equal(result.value.freshnessPolicy, 'ON_CHANGE');
  assert.equal(result.value.lastGoodSnapshotId, ids.snapshot);
  assert.equal(result.value.inputSelectorHash, snapshot().inputSelectorHash);
  assert.equal(result.value.resultCompleteness, 'COMPLETE');
});

void test('[DDA-033] permission revocation, source unavailable, retention, and pending age are visible', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(scope, ids.dashboardId, snapshot());
  const http = controller(coordinator, authorization(false));

  await assert.rejects(
    http.getFreshness({ query: {} }, ids.dashboardId),
    (error: unknown) => error instanceof ForbiddenException,
  );

  const freshness = new FreshnessService(coordinator);
  const allowedHttp = controller(coordinator, authorization(), projection(), freshness);

  await freshness.markSourceCondition(ids.dashboardId, {
    kind: 'SOURCE_UNAVAILABLE',
    reasonCode: 'DEVICE_OFFLINE',
  });
  const unavailable = await allowedHttp.getFreshness({ query: {} }, ids.dashboardId);
  assert.equal(unavailable.accepted, true);
  if (!unavailable.accepted) return;
  assert.equal(unavailable.value.freshnessState, 'SOURCE_UNAVAILABLE');
  assert.equal(unavailable.value.reasonCode, 'DEVICE_OFFLINE');
  assert.equal(unavailable.value.lastGoodSnapshotId, ids.snapshot);

  await freshness.markSourceCondition(ids.dashboardId, {
    kind: 'BLOCKED',
    reasonCode: 'RETENTION_EXPIRED',
  });
  const blocked = await allowedHttp.getFreshness({ query: {} }, ids.dashboardId);
  assert.equal(blocked.accepted, true);
  if (!blocked.accepted) return;
  assert.equal(blocked.value.freshnessState, 'BLOCKED');
  assert.equal(blocked.value.reasonCode, 'RETENTION_EXPIRED');

  await freshness.markPending(ids.dashboardId, Date.now() - 45_000);
  const pending = await allowedHttp.getFreshness({ query: {} }, ids.dashboardId);
  assert.equal(pending.accepted, true);
  if (!pending.accepted) return;
  assert.equal(pending.value.freshnessState, 'PENDING');
  assert.ok((pending.value.pendingDurationMs ?? 0) >= 45_000);
  assert.ok((pending.value.pendingDurationMs ?? Number.MAX_SAFE_INTEGER) < 46_000);
  assert.equal(pending.value.lastGoodSnapshotId, ids.snapshot);
});

void test('[DDA-033] stale state keeps last-good visibility with exact input versions', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(scope, ids.dashboardId, snapshot());
  const freshness = new FreshnessService(coordinator);
  const http = controller(coordinator, authorization(), projection(), freshness);
  await freshness.markSourceCondition(ids.dashboardId, {
    kind: 'STALE',
    reasonCode: 'NEWER_DATASET_ACCEPTED',
  });
  const result = await http.getFreshness({ query: {} }, ids.dashboardId);
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.freshnessState, 'STALE');
  assert.equal(result.value.dashboardVersionId, ids.dashboardVersionId);
  assert.equal(result.value.permissionProjectionVersionId, ids.permission);
  assert.equal(result.value.lastGoodSnapshotId, ids.snapshot);
});
