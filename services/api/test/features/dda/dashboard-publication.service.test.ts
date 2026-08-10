import assert from 'node:assert/strict';
import test from 'node:test';

import { createDashboardVersionV1 } from '@databreeze/domain/data-to-dashboard/v1';

import { DashboardPublicationServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication.service.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import { InMemoryDashboardDraftRepositoryAdapter } from '../../../src/features/dda/dashboard/adapter/in-memory-dashboard-draft-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const scope = Object.freeze({
  scopeType: 'project' as const,
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-0000000000a1',
  tenantScope: scope,
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-0000000000c1',
  idempotencyKey: 'dda-dashboard-publication',
  expectedRevision: 1,
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const hash = 'a'.repeat(64);
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
  permission: '00000000-0000-4000-8000-000000000021',
});

function versionInput() {
  return {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    tenantScope: scope,
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
    filters: [{ filterId: ids.filter, field: 'region', operator: 'IN', scope: 'DASHBOARD' }],
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
    canonicalHash: hash,
    createdAt: '2026-08-10T10:00:00.000Z',
  };
}

function auth(overrides: Partial<DashboardAuthorizationPortV1> = {}): DashboardAuthorizationPortV1 {
  return {
    async authorizeDashboardAction() {
      return Object.freeze({ allowed: true, grantsDatasetAccess: false });
    },
    async projectVisibleFields() {
      return Object.freeze(['region', 'amount']);
    },
    ...overrides,
  };
}

void test('[DDA-025] publish creates immutable snapshot bound to one dashboard version', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const version = createDashboardVersionV1(versionInput());
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repo.saveVersion(version.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 1,
  });
  const service = new DashboardPublicationServiceV1(repo, auth());
  const published = await service.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 1,
    idempotencyKey: 'publish-1',
  });
  assert.equal(published.accepted, true);
  if (!published.accepted) return;
  assert.equal(published.value.dashboardVersionId, ids.version);
  assert.equal(published.value.audience, 'WORKSPACE_VIEWERS');
  assert.equal(published.value.canonicalHash.length, 64);

  const again = await service.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 1,
    idempotencyKey: 'publish-1',
  });
  assert.equal(again.accepted, true);
  if (again.accepted) assert.equal(again.value.snapshotId, published.value.snapshotId);
});

void test('[DDA-025] material change invalidates prior approval and requires new subject', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const version = createDashboardVersionV1(versionInput());
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await repo.saveVersion(version.value);
  await repo.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: context.tenantScope,
    title: { vi: 'Bang', en: 'Dash' },
    status: 'PUBLISHED',
    draftVersionId: ids.version,
    publishedVersionId: ids.version,
    revision: 2,
  });
  const service = new DashboardPublicationServiceV1(repo, auth());
  const rejected = await service.publish(context, {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    audience: 'WORKSPACE_VIEWERS',
    materializationIds: [ids.materialization],
    permissionProjectionVersionId: ids.permission,
    expectedRevision: 1,
    idempotencyKey: 'stale-revision',
    approvalId: '00000000-0000-4000-8000-000000000050',
    materialChange: true,
  });
  assert.equal(rejected.accepted, false);
  if (!rejected.accepted) assert.equal(rejected.code, 'APPROVAL_INVALIDATED');
});
