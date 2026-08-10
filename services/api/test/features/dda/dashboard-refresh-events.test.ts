import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { DashboardRefreshEventsController } from '../../../src/features/dda/refresh/api/dashboard-refresh-events.controller.js';
import { RefreshEventBus } from '../../../src/features/dda/refresh/application/refresh-event-bus.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

const foreignScopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000091',
  workspaceId: '00000000-0000-4000-8000-000000000092',
  projectId: '00000000-0000-4000-8000-000000000093',
});
assert.equal(foreignScopeResult.accepted, true);
const foreignScope = foreignScopeResult.accepted ? foreignScopeResult.value : (null as never);

void test('[DDA-034] SSE emits only content-safe committed events and isolates tenants', () => {
  const bus = new RefreshEventBus();
  const controller = new DashboardRefreshEventsController(bus);
  const dashboardId = '00000000-0000-4000-8000-000000000601';

  bus.publish({
    sequence: 1,
    tenantScope: scope,
    dashboardId,
    snapshotId: '00000000-0000-4000-8000-000000000602',
    freshnessState: 'FRESH',
    eventHash: 'a'.repeat(64),
    occurredAt: '2026-08-10T10:00:00.000Z',
  });
  bus.publish({
    sequence: 2,
    tenantScope: foreignScope,
    dashboardId,
    snapshotId: '00000000-0000-4000-8000-000000000603',
    freshnessState: 'FRESH',
    eventHash: 'b'.repeat(64),
    occurredAt: '2026-08-10T10:00:01.000Z',
  });

  const stream = controller.subscribe({
    tenantScope: scope,
    dashboardId,
    cursor: 0,
  });
  assert.equal(stream.accepted, true);
  if (!stream.accepted) return Promise.resolve();
  assert.equal(stream.value.events.length, 1);
  assert.equal(stream.value.events[0]?.sequence, 1);
  assert.equal(stream.value.events[0]?.snapshotId, '00000000-0000-4000-8000-000000000602');
  assert.equal('resultCells' in (stream.value.events[0] ?? {}), false);
  assert.equal('payloadValues' in (stream.value.events[0] ?? {}), false);
  assert.match(JSON.stringify(stream.value.events), /snapshotId|freshnessState|eventHash/u);
  assert.doesNotMatch(JSON.stringify(stream.value.events), /amount|OCR|filename/u);
});

void test('[DDA-034] clients tolerate duplicate/out-of-order delivery and reconcile after cursor gap', () => {
  const bus = new RefreshEventBus();
  const controller = new DashboardRefreshEventsController(bus);
  const dashboardId = '00000000-0000-4000-8000-000000000611';

  bus.publish({
    sequence: 1,
    tenantScope: scope,
    dashboardId,
    snapshotId: '00000000-0000-4000-8000-000000000612',
    freshnessState: 'FRESH',
    eventHash: 'c'.repeat(64),
    occurredAt: '2026-08-10T10:00:00.000Z',
  });
  bus.publish({
    sequence: 1,
    tenantScope: scope,
    dashboardId,
    snapshotId: '00000000-0000-4000-8000-000000000612',
    freshnessState: 'FRESH',
    eventHash: 'c'.repeat(64),
    occurredAt: '2026-08-10T10:00:00.000Z',
  });
  bus.publish({
    sequence: 3,
    tenantScope: scope,
    dashboardId,
    snapshotId: '00000000-0000-4000-8000-000000000613',
    freshnessState: 'FRESH',
    eventHash: 'd'.repeat(64),
    occurredAt: '2026-08-10T10:00:02.000Z',
  });
  bus.publish({
    sequence: 2,
    tenantScope: scope,
    dashboardId,
    snapshotId: '00000000-0000-4000-8000-000000000614',
    freshnessState: 'STALE',
    eventHash: 'e'.repeat(64),
    occurredAt: '2026-08-10T10:00:01.000Z',
  });

  const stream = controller.subscribe({
    tenantScope: scope,
    dashboardId,
    cursor: 0,
  });
  assert.equal(stream.accepted, true);
  if (!stream.accepted) return Promise.resolve();
  assert.deepEqual(
    stream.value.events.map((event) => event.sequence),
    [1, 2, 3],
  );

  const gap = controller.subscribe({
    tenantScope: scope,
    dashboardId,
    cursor: 10,
  });
  assert.equal(gap.accepted, true);
  if (!gap.accepted) return Promise.resolve();
  assert.equal(gap.value.reconcileViaRest, true);
  assert.equal(gap.value.reasonCode, 'CURSOR_GAP');
  assert.deepEqual(gap.value.events, []);
});

void test('[DDA-034] permission changes force REST reconciliation without raw result streaming', () => {
  const bus = new RefreshEventBus();
  const controller = new DashboardRefreshEventsController(bus);
  const dashboardId = '00000000-0000-4000-8000-000000000621';
  bus.publish({
    sequence: 1,
    tenantScope: scope,
    dashboardId,
    snapshotId: '00000000-0000-4000-8000-000000000622',
    freshnessState: 'FRESH',
    eventHash: 'f'.repeat(64),
    occurredAt: '2026-08-10T10:00:00.000Z',
  });

  const denied = controller.subscribe({
    tenantScope: scope,
    dashboardId,
    cursor: 0,
    authorized: false,
  });
  assert.equal(denied.accepted, false);
  if (denied.accepted) return Promise.resolve();
  assert.equal(denied.code, 'PERMISSION_CHANGED');
});
