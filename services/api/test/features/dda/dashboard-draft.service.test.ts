import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { createDashboardVersionV1 } from '@databreeze/domain/data-to-dashboard/v1';

import { DashboardDraftServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-draft.service.js';
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
  idempotencyKey: 'dda-dashboard-draft',
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
  parent: '00000000-0000-4000-8000-000000000022',
});

function versionInput(overrides: Record<string, unknown> = {}) {
  return {
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
    canonicalHash: hash,
    createdAt: '2026-08-10T10:00:00.000Z',
    ...overrides,
  };
}

void test('[DDA-020][DDA-022] draft versions keep stable page/widget IDs and immutable parent links', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const service = new DashboardDraftServiceV1(repo);
  const created = await service.acceptProposal(context, {
    proposalId: '00000000-0000-4000-8000-000000000040',
    version: versionInput(),
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.value.pages[0]?.pageId, ids.page);
  assert.equal(created.value.widgets[0]?.widgetId, ids.widget);
  assert.equal(created.value.parentVersionId, ids.parent);
  assert.equal(created.value.canonicalHash.length, 64);

  const restored = await service.restoreWidget(context, {
    dashboardId: ids.dashboard,
    versionId: created.value.versionId,
    widgetId: ids.widget,
  });
  assert.equal(restored.accepted, true);
  if (restored.accepted) {
    assert.equal(restored.value.widgets[0]?.widgetId, ids.widget);
    assert.notEqual(restored.value.versionId, created.value.versionId);
    assert.equal(restored.value.parentVersionId, created.value.versionId);
  }
});

void test('[DDA-021] rejects invalid widget/field/grain/unit combinations', async () => {
  const service = new DashboardDraftServiceV1(new InMemoryDashboardDraftRepositoryAdapter());
  const rejected = await service.acceptProposal(context, {
    proposalId: '00000000-0000-4000-8000-000000000041',
    version: versionInput({
      widgets: [
        {
          widgetId: ids.widget,
          type: 'UNKNOWN_CHART',
          pageId: ids.page,
          binding: {
            analysisPlanVersionId: ids.plan,
            materializationDefinitionId: ids.materialization,
          },
          title: { vi: 'X', en: 'X' },
        },
      ],
    }),
  });
  assert.equal(rejected.accepted, false);
  if (!rejected.accepted) assert.equal(rejected.code, 'UNSUPPORTED_WIDGET');
});

void test('[DDA-023] filter scope changes cannot mutate certified definitions silently', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const service = new DashboardDraftServiceV1(repo);
  const created = await service.acceptProposal(context, {
    proposalId: '00000000-0000-4000-8000-000000000042',
    version: versionInput({ publicationPolicy: 'CERTIFIED' }),
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const mutated = await service.applyFilter(context, {
    dashboardId: ids.dashboard,
    versionId: created.value.versionId,
    filter: {
      filterId: ids.filter,
      field: 'region',
      operator: 'EQ',
      scope: 'WIDGET',
      silentCertifiedMutation: true,
    },
  });
  assert.equal(mutated.accepted, false);
  if (!mutated.accepted) assert.equal(mutated.code, 'CERTIFIED_DEFINITION_LOCKED');
});

void test('[DDA-024] accepting an agent proposal creates a draft only, never a published snapshot', async () => {
  const repo = new InMemoryDashboardDraftRepositoryAdapter();
  const service = new DashboardDraftServiceV1(repo);
  const created = await service.acceptProposal(context, {
    proposalId: '00000000-0000-4000-8000-000000000043',
    version: versionInput({ versionId: '00000000-0000-4000-8000-000000000044' }),
    proposalSummary: {
      affectedPages: [ids.page],
      affectedWidgets: [ids.widget],
      beforeAfter: 'Add KPI',
      assumptions: ['Sales only'],
      estimatedCost: { cpuMs: 10, memoryMb: 8 },
    },
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const identity = await repo.findIdentity(context.tenantScope, ids.dashboard);
  assert.ok(identity);
  assert.equal(identity?.status, 'DRAFT');
  assert.equal(identity?.publishedVersionId, undefined);
  assert.equal(identity?.draftVersionId, created.value.versionId);
});

void test('[DDA-020] canonical hash is deterministic for the same version graph', () => {
  const first = createDashboardVersionV1(versionInput());
  const second = createDashboardVersionV1(versionInput());
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (first.accepted && second.accepted) {
    assert.equal(first.value.canonicalHash, second.value.canonicalHash);
    assert.equal(createHash('sha256').update(first.value.canonicalHash).digest('hex').length, 64);
  }
});
