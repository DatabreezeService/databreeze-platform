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

function createMemoryClient(
  options: { readonly versionCreateRace?: boolean } = {},
): DdaDashboardDatabaseClientV1 {
  const identities = new Map<string, DashboardRecordRowV1>();
  const versions = new Map<string, DashboardVersionRecordRowV1>();
  return {
    dashboardRecord: {
      create(input) {
        const row = {
          ...input.data,
          createdAt: new Date('2026-08-10T00:00:00.000Z'),
          updatedAt: new Date('2026-08-10T00:00:00.000Z'),
        };
        identities.set(input.data.id, row);
        return Promise.resolve(row);
      },
      updateMany(input) {
        const id = String(input.where['id']);
        const existing = identities.get(id);
        if (
          existing === undefined ||
          existing.organizationId !== input.where['organizationId'] ||
          existing.workspaceId !== input.where['workspaceId'] ||
          existing.projectId !== input.where['projectId'] ||
          existing.revision !== input.where['revision']
        ) {
          return Promise.resolve({ count: 0 });
        }
        identities.set(id, {
          ...existing,
          ...input.data,
          updatedAt: new Date('2026-08-10T00:01:00.000Z'),
        } as DashboardRecordRowV1);
        return Promise.resolve({ count: 1 });
      },
      findFirst(input) {
        const row = identities.get(String(input.where['id']));
        if (!row) return Promise.resolve(null);
        if (
          (input.where['organizationId'] !== undefined &&
            row.organizationId !== input.where['organizationId']) ||
          (input.where['workspaceId'] !== undefined &&
            row.workspaceId !== input.where['workspaceId']) ||
          (input.where['projectId'] !== undefined && row.projectId !== input.where['projectId'])
        ) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      },
    },
    dashboardVersionRecord: {
      create(input) {
        if (options.versionCreateRace && !versions.has(input.data.id)) {
          versions.set(input.data.id, {
            ...input.data,
            layoutGraph: Object.fromEntries([
              ...Object.entries(
                input.data.layoutGraph as Readonly<Record<string, unknown>>,
              ).reverse(),
              ['compatibleMetadata', { writer: 'legacy' }],
            ]),
            createdAt: new Date(input.data.createdAt),
          });
          return Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' }));
        }
        const row = {
          ...input.data,
          createdAt: new Date(input.data.createdAt),
        };
        versions.set(input.data.id, row);
        return Promise.resolve(row);
      },
      findFirst(input) {
        const row = versions.get(String(input.where['id']));
        if (!row) return Promise.resolve(null);
        if (
          (input.where['organizationId'] !== undefined &&
            row.organizationId !== input.where['organizationId']) ||
          (input.where['workspaceId'] !== undefined &&
            row.workspaceId !== input.where['workspaceId']) ||
          (input.where['projectId'] !== undefined && row.projectId !== input.where['projectId'])
        ) {
          return Promise.resolve(null);
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

void test('[DDA-025][DDA-026] Prisma dashboard versions are create-only and a global ID cannot move an identity across tenants', async () => {
  const repository = new PrismaDashboardRepositoryAdapter(createMemoryClient());
  const version = createDashboardVersionV1({
    dashboardId: ids.dashboard,
    versionId: ids.version,
    tenantScope,
    pages: [
      {
        pageId: ids.page,
        order: 1,
        title: { vi: 'Doanh số', en: 'Sales' },
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
        title: { vi: 'Tổng doanh số', en: 'Total sales' },
      },
    ],
    filters: [],
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
  await repository.saveVersion(version.value);
  await assert.rejects(
    repository.saveVersion({ ...version.value, canonicalHash: 'b'.repeat(64) }),
    /DDA_IMMUTABLE_VERSION_CONFLICT/u,
  );

  await repository.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope,
    title: { vi: 'Bảng điều khiển', en: 'Dashboard' },
    status: 'DRAFT',
    revision: 1,
  });
  const otherScope = parseTenantScopeV1({
    scopeType: 'project',
    organizationId: tenantScope.organizationId,
    workspaceId: '00000000-0000-4000-8000-000000000099',
    projectId: '00000000-0000-4000-8000-000000000003',
  });
  assert.equal(otherScope.accepted, true);
  if (!otherScope.accepted) return;
  await assert.rejects(
    repository.saveIdentity({
      dashboardId: ids.dashboard,
      tenantScope: otherScope.value,
      title: { vi: 'Không được phép', en: 'Not allowed' },
      status: 'DRAFT',
      revision: 2,
    }),
    /DDA_DASHBOARD_IDENTITY_CONFLICT/u,
  );
  const original = await repository.findByDashboardId(tenantScope, ids.dashboard);
  assert.equal(original?.title.en, 'Dashboard');
});

void test('[DDA-020][DDA-026] concurrent identical version creation replays after a scoped P2002 race', async () => {
  const repository = new PrismaDashboardRepositoryAdapter(
    createMemoryClient({ versionCreateRace: true }),
  );
  const version = createDashboardVersionV1({
    dashboardId: ids.dashboard,
    versionId: ids.version,
    tenantScope,
    pages: [
      {
        pageId: ids.page,
        order: 1,
        title: { vi: 'Doanh số', en: 'Sales' },
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
        title: { vi: 'Tổng doanh số', en: 'Total sales' },
      },
    ],
    filters: [],
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
    canonicalHash: 'c'.repeat(64),
    createdAt: '2026-08-10T10:00:00.000Z',
  });
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repository.saveVersion(version.value);
  const loaded = await repository.findVersion(tenantScope, ids.version);
  assert.equal(loaded?.canonicalHash, 'c'.repeat(64));
});
