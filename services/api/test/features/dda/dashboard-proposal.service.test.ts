import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createIamTenantContextV1,
  type IamTenantContextV1,
} from '../../../src/features/iam/application/tenant-context.js';
import { createDdaAiEgressPolicyV1 } from '@databreeze/domain/data-to-dashboard/policy-v1';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import {
  DashboardProposalServiceV1,
  type DashboardProposalTrustedContextV1,
} from '../../../src/features/dda/dashboard/application/dashboard-proposal.service.js';
import type {
  DashboardProposalPortV1,
  DashboardProposalV1,
} from '../../../src/features/dda/dashboard/application/dashboard-proposal.port.js';
import type { DashboardProposalContextPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-proposal-context.port.js';
import { InMemoryDashboardProposalRepositoryAdapter } from '../../../src/features/dda/dashboard/adapter/in-memory-dashboard-proposal-repository.adapter.js';

const id = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;
const ids = {
  organizationId: id('01'),
  workspaceId: id('02'),
  projectId: id('03'),
  actorId: id('04'),
  correlationId: id('05'),
  dashboardId: id('06'),
  parentVersionId: id('07'),
  analysisPlanVersionId: id('08'),
  targetPageId: id('09'),
  materializationDefinitionId: id('10'),
  dimensionId: id('11'),
  measureId: id('12'),
};

const created = createIamTenantContextV1({
  tenantScope: {
    scopeType: 'project',
    organizationId: ids.organizationId,
    workspaceId: ids.workspaceId,
    projectId: ids.projectId,
  },
  actorId: ids.actorId,
  correlationId: ids.correlationId,
  idempotencyKey: 'proposal-test',
  authorizationEpoch: 1,
});
if (!created.accepted) throw new Error('invalid context fixture');
const context: IamTenantContextV1 = created.value;

function trusted(): DashboardProposalTrustedContextV1 {
  return {
    dashboardId: ids.dashboardId,
    parentVersionId: ids.parentVersionId,
    expectedRevision: 7,
    analysisPlanVersionId: ids.analysisPlanVersionId,
    targetPageId: ids.targetPageId,
    authorizedFields: [{ id: ids.dimensionId, label: { vi: 'Khu vực', en: 'Region' } }],
    authorizedMetrics: [{ id: ids.measureId, label: { vi: 'Doanh số', en: 'Revenue' } }],
    resultShapes: ['TABLE', 'KPI'],
    widgetAllowlist: ['KPI', 'BAR', 'LINE', 'PIE'],
    responsiveRules: { supportedSpans: [3, 6, 12], defaultSpan: 6 },
    costBounds: { maxOptions: 4, maxCpuMs: 120000, maxMemoryMb: 4096 },
    binding: {
      analysisPlanVersionId: ids.analysisPlanVersionId,
      materializationDefinitionId: ids.materializationDefinitionId,
      dimensionIds: [ids.dimensionId],
      measureIds: [ids.measureId],
    },
  };
}

function output(types: readonly string[] = ['KPI', 'BAR']): DashboardProposalV1 {
  return {
    status: 'PROPOSED',
    pages: [],
    widgets: types.map((type, index) => ({
      widgetId: id(String(13 + index).padStart(2, '0')),
      type,
      pageId: ids.targetPageId,
      title: { vi: `Biểu đồ ${index + 1}`, en: `Chart ${index + 1}` },
      bindings: type === 'BAR' ? [ids.dimensionId, ids.measureId] : [ids.measureId],
    })),
    filters: [],
    rationale: 'Compatible alternatives',
    assumptions: ['Authorized bindings only'],
  };
}

function provider(value: DashboardProposalV1): DashboardProposalPortV1 {
  return {
    isAvailable: () => Promise.resolve(true),
    proposeDashboard: () => Promise.resolve(value),
  };
}

function contextPort(
  value:
    | DashboardProposalTrustedContextV1
    | { readonly accepted: false; readonly code: 'UNAUTHORIZED' | 'UNAVAILABLE' },
): DashboardProposalContextPortV1 {
  return {
    resolve: () =>
      Promise.resolve('accepted' in value ? value : { accepted: true as const, value }),
  };
}

function request() {
  return {
    dashboardId: ids.dashboardId,
    question: 'Show revenue by region',
    analysisPlanVersionId: ids.analysisPlanVersionId,
    targetPageId: ids.targetPageId,
    locale: 'en' as const,
  };
}

function enabledPolicy() {
  const result = createDdaAiEgressPolicyV1({
    policyId: id('20'),
    tenantScope: context.tenantScope,
    enabled: true,
    locality: 'CLOUD',
    purposeAllowlist: ['PLAN_PROPOSAL'],
    adapterAllowlist: ['openai-responses'],
    allowMetadata: true,
    maximumPayloadBytes: 65536,
    retentionDays: 0,
  });
  if (!result.accepted) throw new Error('invalid policy fixture');
  return result.value;
}

const options = {
  killSwitchEnv: () => 'true',
  policyStore: { getPolicy: () => enabledPolicy() },
} as const;

void test('[DDA-015, DDA-016, DDA-017, DDA-019] persists two compatible preview alternatives in tenant scope', async () => {
  const repository = new InMemoryDashboardProposalRepositoryAdapter();
  const service = new DashboardProposalServiceV1(
    provider(output()),
    contextPort(trusted()),
    repository,
    options,
  );
  const result = await service.propose(context, request());
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.previewOnly, true);
  assert.equal(result.value.publishes, false);
  assert.equal(result.value.options.length, 2);
  const stored = await repository.findById(context.tenantScope, result.value.proposalId);
  assert.equal(stored?.state, 'PROPOSED');
  const otherScopeResult = parseTenantScopeV1({
    scopeType: 'project' as const,
    organizationId: id('31'),
    workspaceId: id('32'),
    projectId: id('33'),
  });
  if (!otherScopeResult.accepted) throw new Error('invalid other scope fixture');
  const otherScope = otherScopeResult.value;
  assert.equal(await repository.findById(otherScope, result.value.proposalId), undefined);
  assert.equal(
    await repository.markAccepted(otherScope, result.value.proposalId, ids.parentVersionId),
    false,
  );
});

void test('[DDA-017, DDA-020] normalizes legacy grouping types and rejects unauthorized bindings', async () => {
  const repository = new InMemoryDashboardProposalRepositoryAdapter();
  const service = new DashboardProposalServiceV1(
    provider(output(['LINE_AREA', 'PIE_DONUT'])),
    contextPort(trusted()),
    repository,
    options,
  );
  const normalized = await service.propose(context, request());
  assert.equal(normalized.accepted, true);
  if (normalized.accepted)
    assert.deepEqual(
      normalized.value.options.map((option) => option.type),
      ['LINE', 'PIE'],
    );

  const hostile = {
    ...output(),
    widgets: output().widgets.map((widget, index) =>
      index === 0 ? { ...widget, bindings: [id('99')] } : widget,
    ),
  };
  const rejected = await new DashboardProposalServiceV1(
    provider(hostile),
    contextPort(trusted()),
    repository,
    options,
  ).propose(context, request());
  assert.deepEqual(rejected, { accepted: false, code: 'INVALID_BINDING' });
});

void test('[DDA-044, DDA-050] fails closed for unavailable providers and denied trusted context', async () => {
  const repository = new InMemoryDashboardProposalRepositoryAdapter();
  const disabled: DashboardProposalPortV1 = {
    isAvailable: () => Promise.resolve(false),
    proposeDashboard: () => Promise.resolve(output()),
  };
  const unavailable = await new DashboardProposalServiceV1(
    disabled,
    contextPort(trusted()),
    repository,
    options,
  ).propose(context, request());
  assert.deepEqual(unavailable, { accepted: false, code: 'ADAPTER_UNAVAILABLE' });
  const denied = await new DashboardProposalServiceV1(
    provider(output()),
    contextPort({ accepted: false, code: 'UNAUTHORIZED' }),
    repository,
    options,
  ).propose(context, request());
  assert.deepEqual(denied, { accepted: false, code: 'UNAUTHORIZED' });
});

void test('[DDA-017] rejects hostile provider titles without persisting a record', async () => {
  const repository = new InMemoryDashboardProposalRepositoryAdapter();
  const hostile = {
    ...output(),
    widgets: output().widgets.map((widget, index) =>
      index === 0
        ? { ...widget, title: { vi: '<script>alert(1)</script>', en: 'Revenue' } }
        : widget,
    ),
  };
  const result = await new DashboardProposalServiceV1(
    provider(hostile),
    contextPort(trusted()),
    repository,
    options,
  ).propose(context, request());
  assert.deepEqual(result, { accepted: false, code: 'HOSTILE_CONTENT_REJECTED' });
});
