import assert from 'node:assert/strict';
import test from 'node:test';

import { createDashboardVersionV1 } from '@databreeze/domain/data-to-dashboard/v1';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaDashboardRepositoryAdapter,
  type DdaDashboardDatabaseClientV1,
  type DashboardRecordRowV1,
  type DashboardVersionRecordRowV1,
} from '../../../src/features/dda/adapter/prisma-dashboard-repository.adapter.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

const ids = Object.freeze({
  dashboard: '00000000-0000-4000-8000-00000000001b',
  version: '00000000-0000-4000-8000-000000000011',
  page: '00000000-0000-4000-8000-00000000001c',
  widget: '00000000-0000-4000-8000-00000000001d',
  filter: '00000000-0000-4000-8000-00000000001e',
  plan: '00000000-0000-4000-8000-000000000010',
  materialization: '00000000-0000-4000-8000-00000000001f',
  dataset: '00000000-0000-4000-8000-000000000018',
  semantic: '00000000-0000-4000-8000-000000000019',
  metric: '00000000-0000-4000-8000-00000000001a',
  parent: '00000000-0000-4000-8000-000000000022',
});

function createMemoryClient(): DdaDashboardDatabaseClientV1 {
  const identities = new Map<string, DashboardRecordRowV1>();
  const versions = new Map<string, DashboardVersionRecordRowV1>();
  return {
    dashboardRecord: {
      upsert(input) {
        identities.set(input.create.id, {
          ...input.create,
          createdAt: new Date('2026-08-10T00:00:00.000Z'),
          updatedAt: new Date('2026-08-10T00:00:00.000Z'),
        });
        return Promise.resolve(identities.get(input.create.id)!);
      },
      findFirst(input) {
        const row = identities.get(input.where.id);
        if (!row) return Promise.resolve(null);
        if (
          row.organizationId !== input.where.organizationId ||
          row.workspaceId !== input.where.workspaceId ||
          row.projectId !== input.where.projectId
        ) {
          return null;
        }
        return Promise.resolve(row);
      },
    },
    dashboardVersionRecord: {
      upsert(input) {
        versions.set(input.create.id, {
          ...input.create,
          createdAt: new Date(input.create.createdAt),
        });
        return Promise.resolve(versions.get(input.create.id)!);
      },
      findFirst(input) {
        const row = versions.get(input.where.id);
        if (!row) return Promise.resolve(null);
        if (
          row.organizationId !== input.where.organizationId ||
          row.workspaceId !== input.where.workspaceId ||
          row.projectId !== input.where.projectId
        ) {
          return null;
        }
        return Promise.resolve(row);
      },
    },
  };
}

void test('[DDA-001] Prisma dashboard repository persists metadata-only identity and version under tenant scope', async () => {
  const repository = new PrismaDashboardRepositoryAdapter(createMemoryClient());

  await repository.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope,
    title: { vi: 'Bảng điều khiển', en: 'Dashboard' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 1,
  });

  const identity = await repository.findByDashboardId(tenantScope, ids.dashboard);
  assert.ok(identity);
  assert.equal(identity.title.vi, 'Bảng điều khiển');
  assert.equal(identity.title.en, 'Dashboard');

  const version = createDashboardVersionV1({
    dashboardId: ids.dashboard,
    versionId: ids.version,
    tenantScope,
    parentVersionId: ids.parent,
    pages: [
      {
        pageId: ids.page,
        order: 1,
        title: { vi: 'Doanh so', en: 'Sales' },
        layout: {
          desktop: [{ widgetId: ids.widget, x: 0, y: 0, w: 6, h: 4 }],
          tablet: [{ widgetId: ids.widget, x: 0, y: 0, w: 6, h: 4 }],
          mobile: [{ widgetId: ids.widget, x: 0, y: 0, w: 4, h: 4 }],
        },
      },
    ],
    widgets: [
      {
        widgetId: ids.widget,
        type: 'KPI',
        pageId: ids.page,
        binding: {
          analysisPlanVersionId: ids.plan,
          materializationDefinitionId: ids.materialization,
        },
        title: { vi: 'Tong doanh so', en: 'Total sales' },
      },
    ],
    filters: [
      {
        filterId: ids.filter,
        field: 'region',
        operator: 'IN',
        scope: 'DASHBOARD',
      },
    ],
    datasetBindings: [
      {
        datasetVersionId: ids.dataset,
        semanticVersionId: ids.semantic,
        metricVersionId: ids.metric,
      },
    ],
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    freshnessPolicy: 'ON_CHANGE',
    publicationPolicy: 'REVIEWED',
    canonicalHash: 'a'.repeat(64),
    createdAt: '2026-08-10T10:00:00.000Z',
  });
  assert.equal(version.accepted, true);
  if (!version.accepted) return;

  await repository.saveVersion(version.value);
  const loaded = await repository.findVersion(tenantScope, ids.version);
  assert.ok(loaded);
  assert.equal(loaded.versionId, ids.version);
  assert.equal(loaded.canonicalHash, 'a'.repeat(64));

  const otherScope = parseTenantScopeV1({
    scopeType: 'project',
    organizationId: '00000000-0000-4000-8000-000000000001',
    workspaceId: '00000000-0000-4000-8000-000000000099',
    projectId: '00000000-0000-4000-8000-000000000003',
  });
  assert.equal(otherScope.accepted, true);
  if (!otherScope.accepted) return;
  const crossScope = await repository.findByDashboardId(otherScope.value, ids.dashboard);
  assert.equal(crossScope, undefined);
});
