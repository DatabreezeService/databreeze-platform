import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryDashboardDraftRepositoryAdapter } from '../../../src/features/dda/dashboard/adapter/in-memory-dashboard-draft-repository.adapter.js';
import { DashboardDraftControllerV1 } from '../../../src/features/dda/dashboard/api/dashboard-draft.controller.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import { DashboardDraftServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-draft.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

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
  idempotencyKey: 'dda-dashboard-live-read',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

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

function allowAllAuth(): DashboardAuthorizationPortV1 {
  return {
    authorizeDashboardAction() {
      return Promise.resolve(
        Object.freeze({
          allowed: true,
          grantsDatasetAccess: false,
        }),
      );
    },
    projectVisibleFields() {
      return Promise.resolve(Object.freeze([]));
    },
  };
}

function denyAuth(): DashboardAuthorizationPortV1 {
  return {
    authorizeDashboardAction() {
      return Promise.resolve(
        Object.freeze({
          allowed: false,
          grantsDatasetAccess: false,
        }),
      );
    },
    projectVisibleFields() {
      return Promise.resolve(Object.freeze([]));
    },
  };
}

void test('[DDA-020] GET draft returns permission-filtered current draft for authorized caller', async () => {
  const repository = new InMemoryDashboardDraftRepositoryAdapter();
  const service = new DashboardDraftServiceV1(repository, allowAllAuth());
  const accepted = await service.acceptProposal(context, {
    proposalId: '00000000-0000-4000-8000-0000000000b1',
    version: {
      dashboardId: ids.dashboard,
      versionId: ids.version,
      tenantScope: scope,
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
      createdAt: '2026-08-11T02:00:00.000Z',
    },
  });
  assert.equal(accepted.accepted, true, 'fixture draft must be accepted');

  const requestContext: RequestTenantContextPortV1 = {
    resolve() {
      return Promise.resolve(context);
    },
  };
  const controller = new DashboardDraftControllerV1(service, requestContext);
  const draft = await controller.getDraft({}, ids.dashboard);
  assert.equal(draft.dashboardId, ids.dashboard);
  assert.equal(draft.versionId, ids.version);
  assert.equal(draft.pages.length, 1);
  assert.equal(draft.widgets[0]?.widgetId, ids.widget);
  assert.equal(draft.widgets[0]?.values.length, 0);
  assert.equal(draft.freshness, 'DRAFT');
});

void test('[DDA-020] GET draft fails closed on revocation and missing draft', async () => {
  const repository = new InMemoryDashboardDraftRepositoryAdapter();
  const requestContext: RequestTenantContextPortV1 = {
    resolve() {
      return Promise.resolve(context);
    },
  };
  const denied = new DashboardDraftControllerV1(
    new DashboardDraftServiceV1(repository, denyAuth()),
    requestContext,
  );
  await assert.rejects(() => denied.getDraft({}, ids.dashboard), /DASHBOARD_DRAFT_UNAUTHORIZED/u);

  const missing = new DashboardDraftControllerV1(
    new DashboardDraftServiceV1(repository, allowAllAuth()),
    requestContext,
  );
  await assert.rejects(() => missing.getDraft({}, ids.dashboard), /DASHBOARD_DRAFT_NOT_FOUND/u);
});
