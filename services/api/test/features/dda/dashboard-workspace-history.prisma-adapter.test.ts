import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaDashboardWorkspaceHistoryAdapter,
  type DdaDashboardWorkspaceHistoryDatabaseClientV1,
} from '../../../src/features/dda/dashboard/adapter/prisma-dashboard-workspace-history.adapter.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000731',
  workspace: '00000000-0000-4000-8000-000000000732',
  project: '00000000-0000-4000-8000-000000000733',
  dashboard: '00000000-0000-4000-8000-000000000734',
  analysis: '00000000-0000-4000-8000-000000000735',
  allowedActor: '00000000-0000-4000-8000-000000000736',
  revokedActor: '00000000-0000-4000-8000-000000000737',
});

const parsedTenantScope = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: ids.organization,
  workspaceId: ids.workspace,
  projectId: ids.project,
});
if (!parsedTenantScope.accepted) throw new Error(parsedTenantScope.code);
const tenantScope = parsedTenantScope.value;

function database(): DdaDashboardWorkspaceHistoryDatabaseClientV1 {
  const dashboard = Object.freeze({
    id: ids.dashboard,
    scopeType: 'project',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: ids.project,
    titleVi: 'Bảng điều khiển riêng',
    titleEn: 'Private dashboard',
    status: 'DRAFT',
    updatedAt: new Date('2026-08-12T10:00:00.000Z'),
  });
  const analysis = Object.freeze({
    id: ids.analysis,
    scopeType: 'project',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: ids.project,
    createdAt: new Date('2026-08-12T09:00:00.000Z'),
  });
  return {
    dashboardRecord: {
      findMany: () => Promise.resolve([dashboard]),
      findFirst: ({ where }) => Promise.resolve(where['id'] === ids.dashboard ? dashboard : null),
    },
    analysisPlanRecord: {
      findMany: () => Promise.resolve([analysis]),
      findFirst: ({ where }) => Promise.resolve(where['id'] === ids.analysis ? analysis : null),
    },
  };
}

function actorAwareAuthorization(): DashboardAuthorizationPortV1 {
  return {
    authorizeDashboardAction(input) {
      return Promise.resolve(
        Object.freeze({
          allowed: input.actorId === ids.allowedActor,
          grantsDatasetAccess: false,
        }),
      );
    },
    projectVisibleFields() {
      return Promise.resolve(Object.freeze([]));
    },
  };
}

type HistoryAdapterConstructor = new (
  db: DdaDashboardWorkspaceHistoryDatabaseClientV1,
  authorization?: DashboardAuthorizationPortV1,
) => PrismaDashboardWorkspaceHistoryAdapter;

void test('[DDA-026] Prisma history reauthorization applies the current actor-specific dashboard VIEW decision', async () => {
  const Adapter = PrismaDashboardWorkspaceHistoryAdapter as unknown as HistoryAdapterConstructor;
  const adapter = new Adapter(database(), actorAwareAuthorization());

  assert.equal(
    await adapter.reauthorize({
      tenantScope,
      actorId: ids.allowedActor,
      kind: 'DASHBOARD',
      subjectId: ids.dashboard,
    }),
    'ALLOWED',
  );
  assert.equal(
    await adapter.reauthorize({
      tenantScope,
      actorId: ids.revokedActor,
      kind: 'DASHBOARD',
      subjectId: ids.dashboard,
    }),
    'DENIED',
  );
});

void test('[DDA-026] Prisma history fails closed when subject authorization is unavailable or unsupported', async () => {
  const Adapter = PrismaDashboardWorkspaceHistoryAdapter as unknown as HistoryAdapterConstructor;
  const withoutAuthorization = new Adapter(database());
  const withDashboardAuthorization = new Adapter(database(), actorAwareAuthorization());

  assert.equal(
    await withoutAuthorization.reauthorize({
      tenantScope,
      actorId: ids.allowedActor,
      kind: 'DASHBOARD',
      subjectId: ids.dashboard,
    }),
    'UNAVAILABLE',
  );
  assert.equal(
    await withDashboardAuthorization.reauthorize({
      tenantScope,
      actorId: ids.allowedActor,
      kind: 'ANALYSIS',
      subjectId: ids.analysis,
    }),
    'DENIED',
  );
});
