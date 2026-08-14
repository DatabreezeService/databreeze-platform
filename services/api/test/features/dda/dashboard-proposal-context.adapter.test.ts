import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDashboardVersionV1,
  createDdaAnalysisPlanV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { parseStableIdentifierV1, parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemoryAnalysisPlanRepositoryAdapter } from '../../../src/features/dda/adapter/in-memory-analysis-plan-repository.adapter.js';
import { InMemoryDependencyRepositoryAdapter } from '../../../src/features/dda/refresh/adapter/in-memory-dependency-repository.adapter.js';
import { InMemoryDashboardDraftRepositoryAdapter } from '../../../src/features/dda/dashboard/adapter/in-memory-dashboard-draft-repository.adapter.js';
import {
  DashboardProposalContextAdapter,
  type DashboardProposalAnalysisCatalogV1,
} from '../../../src/features/dda/dashboard/adapter/dashboard-proposal-context.adapter.js';

const id = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;
const stableId = (suffix: string) => {
  const parsed = parseStableIdentifierV1(id(suffix));
  if (!parsed.accepted) throw new Error('invalid stable identifier fixture');
  return parsed.value;
};
const ids = Object.freeze({
  organization: id('01'),
  workspace: id('02'),
  project: id('03'),
  actor: id('04'),
  correlation: id('05'),
  dashboard: id('06'),
  version: id('07'),
  page: id('08'),
  widget: id('09'),
  plan: id('10'),
  planRecord: id('11'),
  dataset: id('12'),
  semantic: id('13'),
  metric: id('14'),
  permission: id('15'),
  materialization: id('16'),
  dimension: id('17'),
  year: id('18'),
  measure: id('19'),
});

const tenantScopeResult = parseTenantScopeV1({
  scopeType: 'project' as const,
  organizationId: ids.organization,
  workspaceId: ids.workspace,
  projectId: ids.project,
});
if (!tenantScopeResult.accepted) throw new Error('invalid tenant scope fixture');
const tenantScope = tenantScopeResult.value;

const contextResult = createIamTenantContextV1({
  tenantScope,
  actorId: ids.actor,
  correlationId: ids.correlation,
  idempotencyKey: 'dashboard-proposal-context-test',
  authorizationEpoch: 1,
});
if (!contextResult.accepted) throw new Error('invalid proposal context fixture');
const context = contextResult.value;

const planResult = createDdaAnalysisPlanV1({
  planId: ids.planRecord,
  planVersionId: ids.plan,
  tenantScope,
  datasetVersionId: ids.dataset,
  semanticVersionId: ids.semantic,
  metricVersionId: ids.metric,
  permissionProjectionVersionId: ids.permission,
  dimensions: [ids.dimension],
  filters: [{ field: ids.year, operator: 'EQ', value: '2026' }],
  timeRange: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
  timeGrain: 'MONTH',
  joins: [],
  units: { [ids.measure]: 'VND' },
  parameters: {},
  output: { form: 'TABLE', maxRows: 100 },
  assumptions: ['Accepted sales dataset'],
  estimate: { cpuMs: 100, memoryMb: 64 },
  planHash: 'a'.repeat(64),
  createdAt: '2026-08-13T00:00:00.000Z',
});
if (!planResult.accepted) throw new Error('invalid analysis plan fixture');
const plan = planResult.value;

const versionResult = createDashboardVersionV1({
  dashboardId: ids.dashboard,
  versionId: ids.version,
  tenantScope,
  pages: [
    {
      pageId: ids.page,
      order: 1,
      title: { vi: 'Doanh thu', en: 'Revenue' },
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
      type: 'TABLE',
      pageId: ids.page,
      binding: {
        analysisPlanVersionId: ids.plan,
        materializationDefinitionId: ids.materialization,
      },
      title: { vi: 'Bang doanh thu', en: 'Revenue table' },
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
  canonicalHash: 'b'.repeat(64),
  createdAt: '2026-08-13T00:00:00.000Z',
});
if (!versionResult.accepted) throw new Error('invalid dashboard version fixture');
const version = versionResult.value;

const catalog: DashboardProposalAnalysisCatalogV1 = Object.freeze({
  datasetVersionId: ids.dataset,
  semanticVersionId: ids.semantic,
  metricVersionId: ids.metric,
  permissionProjectionVersionId: ids.permission,
  authorizedFields: Object.freeze([ids.dimension, ids.year, ids.measure]),
  authorizedMetrics: Object.freeze([ids.measure]),
  fieldLabels: Object.freeze({
    [ids.dimension]: { vi: 'Khu vuc', en: 'Region' },
    [ids.year]: { vi: 'Nam', en: 'Year' },
    [ids.measure]: { vi: 'Doanh thu', en: 'Revenue' },
  }),
  resultShapes: Object.freeze(['TABLE', 'KPI']),
  widgetAllowlist: Object.freeze(['KPI', 'TABLE', 'BAR', 'LINE'] as const),
  responsiveRules: Object.freeze({ supportedSpans: [3, 4, 6, 8, 12], defaultSpan: 6 }),
  costBounds: Object.freeze({ maxOptions: 4, maxCpuMs: 120000, maxMemoryMb: 4096 }),
});

function dependencies(overrides: Record<string, unknown> = {}) {
  const dashboards = new InMemoryDashboardDraftRepositoryAdapter();
  const plans = new InMemoryAnalysisPlanRepositoryAdapter();
  const materializations = new InMemoryDependencyRepositoryAdapter();
  void dashboards.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope,
    title: { vi: 'Bang dieu khien', en: 'Dashboard' },
    status: 'DRAFT',
    draftVersionId: ids.version,
    revision: 7,
  });
  void dashboards.saveVersion(version);
  void plans.save(plan);
  materializations.seedBindings([
    {
      materializationDefinitionId: ids.materialization,
      tenantScope,
      dashboardId: ids.dashboard,
      dashboardVersionId: ids.version,
      widgetId: ids.widget,
      analysisPlanVersionId: ids.plan,
      datasetVersionId: ids.dataset,
      semanticVersionId: ids.semantic,
      metricVersionId: ids.metric,
      permissionProjectionVersionId: ids.permission,
      parameterHash: 'c'.repeat(64),
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      engineVersion: 'engine-v1',
      adapterVersion: 'adapter-v1',
      effectivePolicyVersionId: ids.permission,
      processorId: 'dda.materialize.query.v1',
      deleted: false,
    },
  ]);

  const authorization = {
    authorizeDashboardAction: (input: { readonly action: string }) => {
      assert.equal(input.action, 'EDIT');
      return Promise.resolve({
        allowed: true,
        grantsDatasetAccess: true,
        grantsAnalysisAccess: true,
      });
    },
    projectVisibleFields: () => Promise.resolve(Object.freeze([])),
  };
  const deterministicResults = {
    execute: (input: { readonly plan: typeof plan }) => {
      assert.equal(input.plan.planVersionId, ids.plan);
      return Promise.resolve({
        resultId: id('20'),
        cells: [
          {
            cellId: id('21'),
            field: ids.measure,
            value: 42,
            unit: 'VND',
            planVersionId: ids.plan,
            metricVersionId: ids.metric,
          },
        ],
        provenance: {
          planVersionId: ids.plan,
          datasetVersionId: ids.dataset,
          engineVersion: 'engine-v1',
        },
      });
    },
  };
  return {
    dashboardDraftRepository: dashboards,
    analysisPlanRepository: plans,
    dashboardAuthorization: authorization,
    dependencyRepository: materializations,
    analysisCatalog: catalog,
    deterministicResults,
    ...overrides,
  };
}

const input = Object.freeze({
  dashboardId: ids.dashboard,
  analysisPlanVersionId: ids.plan,
  targetPageId: ids.page,
  targetWidgetId: ids.widget,
});

void test('[DDA-015][DDA-016][DDA-020] resolves server-owned dashboard, plan, result, binding, layout, and cost context', async () => {
  const adapter = new DashboardProposalContextAdapter(dependencies());
  const result = await adapter.resolve(context, input);

  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.dashboardId, ids.dashboard);
  assert.equal(result.value.parentVersionId, ids.version);
  assert.equal(result.value.expectedRevision, 7);
  assert.equal(result.value.analysisPlanVersionId, ids.plan);
  assert.deepEqual(
    result.value.authorizedFields.map((field) => field.id),
    [ids.dimension, ids.year, ids.measure],
  );
  assert.deepEqual(
    result.value.authorizedMetrics.map((field) => field.id),
    [ids.measure],
  );
  assert.deepEqual(result.value.resultShapes, ['TABLE', 'KPI']);
  assert.deepEqual(result.value.binding, {
    analysisPlanVersionId: ids.plan,
    materializationDefinitionId: ids.materialization,
    dimensionIds: [ids.dimension],
    measureIds: [ids.measure],
  });
  assert.deepEqual(result.value.responsiveRules, {
    supportedSpans: [3, 4, 6, 8, 12],
    defaultSpan: 6,
  });
  assert.deepEqual(result.value.costBounds, { maxOptions: 4, maxCpuMs: 120000, maxMemoryMb: 4096 });
  assert.equal(JSON.stringify(result.value).includes('42'), false);
});

void test('[DDA-026] does not enumerate a dashboard from another tenant scope', async () => {
  const otherScopeResult = parseTenantScopeV1({
    ...tenantScope,
    projectId: id('98'),
  });
  assert.equal(otherScopeResult.accepted, true);
  if (!otherScopeResult.accepted) return;
  const otherContextResult = createIamTenantContextV1({
    tenantScope: otherScopeResult.value,
    actorId: ids.actor,
    correlationId: stableId('97'),
    idempotencyKey: 'dashboard-proposal-context-other-tenant',
    authorizationEpoch: 1,
  });
  assert.equal(otherContextResult.accepted, true);
  if (!otherContextResult.accepted) return;

  const result = await new DashboardProposalContextAdapter(dependencies()).resolve(
    otherContextResult.value,
    input,
  );
  assert.deepEqual(result, { accepted: false, code: 'DASHBOARD_NOT_FOUND' });
});

void test('[DDA-024][DDA-050] ignores client-supplied authority fields and keeps result values out of the trusted context', async () => {
  const adapter = new DashboardProposalContextAdapter(dependencies());
  const clientInput = Object.assign({}, input, {
    authorizedFields: [{ id: id('99'), label: { vi: 'Secret', en: 'Secret' } }],
    authorizedMetrics: [{ id: id('99'), label: { vi: 'Secret', en: 'Secret' } }],
    widgetAllowlist: ['TEXT_NOTE'],
    costBounds: { maxOptions: 99, maxCpuMs: 1, maxMemoryMb: 1 },
    binding: { materializationDefinitionId: id('99') },
  });
  const result = await adapter.resolve(context, clientInput);

  assert.equal(result.accepted, true);
  if (result.accepted) {
    assert.deepEqual(
      result.value.authorizedMetrics.map((field) => field.id),
      [ids.measure],
    );
    assert.deepEqual(result.value.widgetAllowlist, ['KPI', 'TABLE', 'BAR', 'LINE']);
    assert.equal(result.value.costBounds.maxOptions, 4);
    assert.equal(result.value.binding.materializationDefinitionId, ids.materialization);
  }
});

void test('[DDA-026][DDA-050] denies a dashboard before resolving any analysis or materialization details', async () => {
  const deps = dependencies();
  const denied = {
    ...deps,
    dashboardAuthorization: {
      authorizeDashboardAction: () =>
        Promise.resolve({ allowed: false, grantsDatasetAccess: false }),
      projectVisibleFields: () => Promise.resolve(Object.freeze([])),
    },
  };
  const result = await new DashboardProposalContextAdapter(denied).resolve(context, input);
  assert.deepEqual(result, { accepted: false, code: 'UNAUTHORIZED' });
});

void test('[DDA-015][DDA-020] fails closed for an unbound plan or target widget', async () => {
  const unboundPlan = await new DashboardProposalContextAdapter(dependencies()).resolve(context, {
    ...input,
    analysisPlanVersionId: id('98'),
  });
  assert.deepEqual(unboundPlan, { accepted: false, code: 'ANALYSIS_PLAN_NOT_FOUND' });

  const missingWidget = await new DashboardProposalContextAdapter(dependencies()).resolve(context, {
    ...input,
    targetWidgetId: id('97'),
  });
  assert.deepEqual(missingWidget, { accepted: false, code: 'TARGET_NOT_FOUND' });
});

void test('[DDA-015][DDA-020] rejects an unspecified target when several page widgets use the plan', async () => {
  const deps = dependencies();
  const page = version.pages[0];
  const widget = version.widgets[0];
  if (page === undefined || widget === undefined) return;
  const secondWidgetId = stableId('96');
  await deps.dashboardDraftRepository.saveVersion({
    ...version,
    pages: [
      {
        ...page,
        layout: {
          ...page.layout,
          desktop: [...page.layout.desktop, { widgetId: secondWidgetId, x: 6, y: 0, w: 6, h: 4 }],
          tablet: [...page.layout.tablet, { widgetId: secondWidgetId, x: 6, y: 0, w: 6, h: 4 }],
          mobile: [...page.layout.mobile, { widgetId: secondWidgetId, x: 0, y: 4, w: 4, h: 4 }],
        },
      },
    ],
    widgets: [...version.widgets, { ...widget, widgetId: secondWidgetId }],
  });

  const result = await new DashboardProposalContextAdapter(deps).resolve(context, {
    dashboardId: ids.dashboard,
    analysisPlanVersionId: ids.plan,
    targetPageId: ids.page,
  });
  assert.deepEqual(result, { accepted: false, code: 'AMBIGUOUS' });
});

void test('[DDA-015][DDA-021] projects named catalog fields to deterministic opaque contract identifiers', async () => {
  const namedPlanResult = createDdaAnalysisPlanV1({
    ...plan,
    planId: id('30'),
    planVersionId: id('31'),
    dimensions: ['region'],
    filters: [{ field: 'year', operator: 'EQ', value: '2026' }],
    units: { amount: 'VND' },
  });
  assert.equal(namedPlanResult.accepted, true);
  if (!namedPlanResult.accepted) return;

  const namedVersionResult = createDashboardVersionV1({
    ...version,
    widgets: version.widgets.map((widget) => ({
      ...widget,
      binding: {
        ...widget.binding,
        analysisPlanVersionId: namedPlanResult.value.planVersionId,
      },
    })),
  });
  assert.equal(namedVersionResult.accepted, true);
  if (!namedVersionResult.accepted) return;

  const namedCatalog: DashboardProposalAnalysisCatalogV1 = {
    ...catalog,
    authorizedFields: ['region', 'year', 'amount'],
    authorizedMetrics: ['amount'],
    fieldLabels: {
      region: { vi: 'Khu vuc', en: 'Region' },
      year: { vi: 'Nam', en: 'Year' },
      amount: { vi: 'Doanh thu', en: 'Revenue' },
    },
  };
  const deps = dependencies({
    analysisCatalog: namedCatalog,
    dependencyRepository: undefined,
    deterministicResults: undefined,
  });
  const dashboards = deps.dashboardDraftRepository;
  const plans = deps.analysisPlanRepository;
  await dashboards.saveVersion(namedVersionResult.value);
  await plans.save(namedPlanResult.value);

  const first = await new DashboardProposalContextAdapter(deps).resolve(context, {
    ...input,
    analysisPlanVersionId: namedPlanResult.value.planVersionId,
  });
  const second = await new DashboardProposalContextAdapter(deps).resolve(context, {
    ...input,
    analysisPlanVersionId: namedPlanResult.value.planVersionId,
  });
  assert.equal(first.accepted, true, JSON.stringify(first));
  assert.equal(second.accepted, true, JSON.stringify(second));
  if (first.accepted && second.accepted) {
    assert.deepEqual(
      first.value.authorizedFields.map((field) => field.id),
      second.value.authorizedFields.map((field) => field.id),
    );
    assert.match(
      first.value.authorizedFields[0]?.id ?? '',
      /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    assert.notEqual(first.value.authorizedFields[0]?.id, 'region');
    assert.deepEqual(first.value.binding.dimensionIds, [first.value.authorizedFields[0]?.id]);
  }
});

void test('[DDA-021][DDA-026] rejects materialization bindings that expand the authorized field projection', async () => {
  const base = dependencies();
  const malformedBinding = {
    materializationDefinitionId: ids.materialization,
    tenantScope,
    dashboardId: ids.dashboard,
    dashboardVersionId: ids.version,
    widgetId: ids.widget,
    analysisPlanVersionId: ids.plan,
    datasetVersionId: ids.dataset,
    semanticVersionId: ids.semantic,
    metricVersionId: ids.metric,
    permissionProjectionVersionId: ids.permission,
    parameterHash: 'c'.repeat(64),
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    engineVersion: 'engine-v1',
    adapterVersion: 'adapter-v1',
    effectivePolicyVersionId: ids.permission,
    processorId: 'dda.materialize.query.v1',
    deleted: false,
    dimensionIds: [id('99')],
    measureIds: [ids.measure],
  };
  const malformedDependencyRepository = new InMemoryDependencyRepositoryAdapter();
  malformedDependencyRepository.seedBindings([malformedBinding]);
  const result = await new DashboardProposalContextAdapter({
    ...base,
    dependencyRepository: malformedDependencyRepository,
  }).resolve(context, input);
  assert.deepEqual(result, { accepted: false, code: 'UNAVAILABLE' });
});
