import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDashboardWorkspaceHistoryAdapter } from '../../../src/features/dda/dashboard/adapter/in-memory-dashboard-workspace-history.adapter.js';
import type {
  DashboardWorkspaceHistoryCandidateV1,
  DashboardWorkspaceHistoryPortV1,
} from '../../../src/features/dda/dashboard/application/dashboard-workspace-history.port.js';
import { DashboardWorkspaceHistoryServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-workspace-history.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000701',
  workspace: '00000000-0000-4000-8000-000000000702',
  siblingProject: '00000000-0000-4000-8000-000000000703',
  project: '00000000-0000-4000-8000-000000000704',
  actor: '00000000-0000-4000-8000-000000000705',
  correlation: '00000000-0000-4000-8000-000000000706',
  dashboard: '00000000-0000-4000-8000-000000000707',
  analysis: '00000000-0000-4000-8000-000000000708',
  deniedDashboard: '00000000-0000-4000-8000-000000000709',
});

function context(projectId: string = ids.project, idempotencyKey = 'dashboard-history') {
  const created = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'project',
      organizationId: ids.organization,
      workspaceId: ids.workspace,
      projectId,
    },
    actorId: ids.actor,
    correlationId: ids.correlation,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  if (!created.accepted) throw new Error(created.code);
  assert.equal(created.accepted, true, 'history fixture context must be valid');
  return created.value;
}

function candidate(
  input: DashboardWorkspaceHistoryCandidateV1,
): DashboardWorkspaceHistoryCandidateV1 {
  return Object.freeze({
    ...input,
    title: Object.freeze({ ...input.title }),
  });
}

function seededHistory() {
  const repository = new InMemoryDashboardWorkspaceHistoryAdapter();
  repository.seed([
    {
      tenantScope: context().tenantScope,
      candidate: candidate({
        kind: 'DASHBOARD',
        subjectId: ids.dashboard,
        title: {
          vi: 'B\u1ea3ng \u0111i\u1ec1u khi\u1ec3n doanh thu',
          en: 'Revenue dashboard',
        },
        updatedAt: '2026-08-12T09:00:00.000Z',
        safeStatus: 'STALE',
      }),
    },
    {
      tenantScope: context().tenantScope,
      candidate: candidate({
        kind: 'ANALYSIS',
        subjectId: ids.analysis,
        title: { vi: 'Ph\u00e2n t\u00edch doanh thu', en: 'Revenue analysis' },
        updatedAt: '2026-08-12T10:00:00.000Z',
        safeStatus: 'CURRENT',
      }),
    },
    {
      tenantScope: context().tenantScope,
      candidate: candidate({
        kind: 'DASHBOARD',
        subjectId: ids.deniedDashboard,
        title: { vi: 'C:\\private\\sales.xlsx', en: 'C:\\private\\sales.xlsx' },
        updatedAt: '2026-08-12T08:00:00.000Z',
        safeStatus: 'BLOCKED',
      }),
      deniedActorIds: [ids.actor],
    },
  ]);
  return repository;
}

void test('[DDA-026, DDA-033] history reauthorizes current scope, orders authorized metadata, and never enumerates denied entries', async () => {
  const service = new DashboardWorkspaceHistoryServiceV1(seededHistory());

  const result = await service.list(context(), { limit: 30 });

  if (!result.accepted) throw new Error('Expected an accepted permission-filtered history page.');
  assert.equal(result.accepted, true);
  assert.deepEqual(
    result.value.items.map((item) => item.subjectId),
    [ids.analysis, ids.dashboard],
  );
  assert.deepEqual(
    result.value.items.map((item) => item.safeStatus),
    ['CURRENT', 'STALE'],
  );
  assert.equal(JSON.stringify(result).includes(ids.deniedDashboard), false);
  assert.equal(JSON.stringify(result).includes('C:\\private'), false);
});

void test('[DDA-026, DDA-036] history rejects oversized pages and a cursor copied from another scope', async () => {
  const service = new DashboardWorkspaceHistoryServiceV1(seededHistory());

  assert.deepEqual(await service.list(context(), { limit: 51 }), {
    accepted: false,
    code: 'INVALID_PAGE',
  });

  const first = await service.list(context(), { limit: 1 });
  if (!first.accepted) throw new Error(first.code);
  assert.equal(first.accepted, true);
  assert.ok(first.value.nextCursor);

  assert.deepEqual(
    await service.list(context(ids.siblingProject, 'copied-cursor'), {
      limit: 1,
      cursor: first.value.nextCursor,
    }),
    { accepted: false, code: 'INVALID_CURSOR' },
  );
});

void test('[DDA-026] history maps an authorization outage to a content-safe unavailable result', async () => {
  const safeCandidate = candidate({
    kind: 'ANALYSIS',
    subjectId: ids.analysis,
    title: { vi: 'Ph\u00e2n t\u00edch k\u00edn', en: 'Private analysis' },
    updatedAt: '2026-08-12T10:00:00.000Z',
  });
  const unavailable: DashboardWorkspaceHistoryPortV1 = {
    list() {
      return Promise.resolve({ items: [safeCandidate] });
    },
    reauthorize() {
      return Promise.resolve('UNAVAILABLE');
    },
  };
  const service = new DashboardWorkspaceHistoryServiceV1(unavailable);

  const result = await service.list(context(), { limit: 30 });

  assert.deepEqual(result, { accepted: false, code: 'UNAVAILABLE' });
  assert.equal(JSON.stringify(result).includes('Private analysis'), false);
});

void test('[DDA-026] a page of denied candidates does not expose an opaque cursor for hidden history', async () => {
  const repository = new InMemoryDashboardWorkspaceHistoryAdapter();
  repository.seed([
    {
      tenantScope: context().tenantScope,
      candidate: candidate({
        kind: 'DASHBOARD',
        subjectId: ids.deniedDashboard,
        title: { vi: 'C:\\private\\sales.xlsx', en: 'C:\\private\\sales.xlsx' },
        updatedAt: '2026-08-12T11:00:00.000Z',
      }),
      deniedActorIds: [ids.actor],
    },
    {
      tenantScope: context().tenantScope,
      candidate: candidate({
        kind: 'DASHBOARD',
        subjectId: ids.dashboard,
        title: {
          vi: 'B\u1ea3ng \u0111i\u1ec1u khi\u1ec3n doanh thu',
          en: 'Revenue dashboard',
        },
        updatedAt: '2026-08-12T10:00:00.000Z',
      }),
    },
  ]);
  const service = new DashboardWorkspaceHistoryServiceV1(repository);

  const result = await service.list(context(), { limit: 1 });

  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('Expected an accepted denied-only history page.');
  assert.deepEqual(result.value.items, []);
  assert.equal(result.value.nextCursor, undefined);
  assert.equal(JSON.stringify(result).includes(ids.deniedDashboard), false);
});
