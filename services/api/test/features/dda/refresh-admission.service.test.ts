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
import { RefreshAdmissionService } from '../../../src/features/dda/refresh/application/refresh-admission.service.js';
import type { RefreshUsagePortV1 } from '../../../src/features/dda/refresh/application/refresh-usage.port.js';

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
  dashboardId: id('00000000-0000-4000-8000-000000000701'),
  dashboardVersionId: id('00000000-0000-4000-8000-000000000702'),
  snapshot: id('00000000-0000-4000-8000-000000000703'),
  matA: id('00000000-0000-4000-8000-000000000704'),
  permission: id('00000000-0000-4000-8000-000000000705'),
  refreshId: id('00000000-0000-4000-8000-000000000706'),
  correlationId: id('00000000-0000-4000-8000-000000000707'),
};

function snapshot() {
  const createdAtResult = parseStrictUtcTimestampV1('2026-08-10T10:00:00.000Z');
  assert.equal(createdAtResult.accepted, true);
  if (!createdAtResult.accepted) throw new Error('ts');
  const input = {
    snapshotId: ids.snapshot,
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

class FakeUsagePort implements RefreshUsagePortV1 {
  readonly reservations = new Map<string, string>();
  readonly audit: unknown[] = [];
  deniedClass: string | undefined;
  failClosed = false;

  evaluate(input: {
    readonly usageClass: string;
    readonly scopeLevel: 'organization' | 'workspace' | 'project';
  }): Promise<{ readonly admitted: boolean; readonly reasonCode?: string }> {
    if (this.failClosed) return { admitted: false, reasonCode: 'USAGE_AUTHORITY_UNAVAILABLE' };
    if (this.deniedClass === input.usageClass) {
      return { admitted: false, reasonCode: `${input.usageClass}_LIMIT` };
    }
    return { admitted: true };
  }

  reserve(input: {
    readonly reservationKey: string;
    readonly usageClass: string;
  }): Promise<{ readonly reservationId: string }> {
    const existing = this.reservations.get(input.reservationKey);
    if (existing) return { reservationId: existing };
    const reservationId = `res-${this.reservations.size + 1}`;
    this.reservations.set(input.reservationKey, reservationId);
    return { reservationId };
  }

  finalize(reservationId: string): Promise<void> {
    void reservationId;
  }

  release(reservationId: string): Promise<void> {
    for (const [key, value] of this.reservations) {
      if (value === reservationId) this.reservations.delete(key);
    }
  }

  emitContentSafeOutcome(input: {
    readonly action: string;
    readonly outcome: string;
    readonly correlationId: string;
    readonly references: readonly string[];
  }): Promise<void> {
    this.audit.push(input);
  }
}

const usageClasses = [
  'STORAGE',
  'PROFILE_ETL',
  'AI',
  'OCR',
  'MATERIALIZATION',
  'REFRESH_FREQUENCY',
  'CONCURRENCY',
  'CACHE_RETENTION',
  'PUBLICATION',
] as const;

void test('[DDA-036] admission enforces usage classes at organization/workspace/project scopes', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(ids.dashboardId, snapshot());
  const usage = new FakeUsagePort();
  const service = new RefreshAdmissionService(coordinator, usage);

  for (const scopeLevel of ['organization', 'workspace', 'project'] as const) {
    for (const usageClass of usageClasses) {
      usage.deniedClass = usageClass;
      const denied = await service.admit({
        tenantScope: scope,
        dashboardId: ids.dashboardId,
        refreshId: ids.refreshId,
        correlationId: ids.correlationId,
        reservationKey: `${scopeLevel}:${usageClass}`,
        scopeLevel,
        usageClasses: [usageClass],
      });
      assert.equal(denied.accepted, false, `${scopeLevel}/${usageClass}`);
      if (denied.accepted) continue;
      assert.equal(denied.code, 'USAGE_LIMIT_EXCEEDED');
      assert.equal(denied.remediationCode, 'REDUCE_OR_UPGRADE_USAGE');
      assert.doesNotMatch(denied.safeMessage, /plan|price|quota=\d+|bytes=/iu);
    }
  }
});

void test('[DDA-036] denial preserves last-good snapshot, creates no partial publish, and audits safely', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(ids.dashboardId, snapshot());
  const usage = new FakeUsagePort();
  usage.deniedClass = 'MATERIALIZATION';
  const service = new RefreshAdmissionService(coordinator, usage);

  const denied = await service.admit({
    tenantScope: scope,
    dashboardId: ids.dashboardId,
    refreshId: ids.refreshId,
    correlationId: ids.correlationId,
    reservationKey: 'deny-1',
    scopeLevel: 'workspace',
    usageClasses: ['MATERIALIZATION'],
  });
  assert.equal(denied.accepted, false);
  if (denied.accepted) return;
  assert.equal((await coordinator.getCurrentSnapshot(ids.dashboardId))?.snapshotId, ids.snapshot);
  assert.equal(usage.reservations.size, 0);
  assert.equal(usage.audit.length, 1);
  assert.deepEqual(usage.audit[0], {
    action: 'DASHBOARD_REFRESH_ADMISSION',
    outcome: 'DENIED',
    correlationId: ids.correlationId,
    references: [ids.dashboardId, ids.refreshId],
  });
  assert.doesNotMatch(JSON.stringify(usage.audit[0]), /amount|OCR|filename|plan-tier/u);
});

void test('[DDA-036] paid-resource admission is fail-closed and reservation is idempotent', async () => {
  const coordinator = new InMemoryRefreshCoordinatorAdapter();
  await coordinator.setCurrentSnapshot(ids.dashboardId, snapshot());
  const usage = new FakeUsagePort();
  const service = new RefreshAdmissionService(coordinator, usage);

  usage.failClosed = true;
  const unavailable = await service.admit({
    tenantScope: scope,
    dashboardId: ids.dashboardId,
    refreshId: ids.refreshId,
    correlationId: ids.correlationId,
    reservationKey: 'fail-closed',
    scopeLevel: 'project',
    usageClasses: ['AI'],
  });
  assert.equal(unavailable.accepted, false);
  if (unavailable.accepted) return;
  assert.equal(unavailable.code, 'USAGE_AUTHORITY_UNAVAILABLE');

  usage.failClosed = false;
  usage.deniedClass = undefined;
  const first = await service.admit({
    tenantScope: scope,
    dashboardId: ids.dashboardId,
    refreshId: ids.refreshId,
    correlationId: ids.correlationId,
    reservationKey: 'idem-1',
    scopeLevel: 'project',
    usageClasses: ['MATERIALIZATION', 'CONCURRENCY'],
  });
  const second = await service.admit({
    tenantScope: scope,
    dashboardId: ids.dashboardId,
    refreshId: ids.refreshId,
    correlationId: ids.correlationId,
    reservationKey: 'idem-1',
    scopeLevel: 'project',
    usageClasses: ['MATERIALIZATION', 'CONCURRENCY'],
  });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (!first.accepted || !second.accepted) return;
  assert.equal(second.value.reservationId, first.value.reservationId);
  assert.equal(usage.reservations.size, 1);

  await service.finalize(first.value.reservationId);
  await service.release(first.value.reservationId);
  assert.equal(usage.reservations.size, 0);
});
