import assert from 'node:assert/strict';
import test from 'node:test';

import { AnalysisProposalServiceV1 } from '../../../src/features/dda/analyst/application/analysis-proposal.service.js';
import type { AnalysisAdapterPortV1 } from '../../../src/features/dda/analyst/application/analysis-adapter.port.js';
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
  idempotencyKey: 'dda-analysis-proposal',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const authorizedCatalog = Object.freeze({
  datasetVersionId: '00000000-0000-4000-8000-000000000018',
  semanticVersionId: '00000000-0000-4000-8000-000000000019',
  metricVersionId: '00000000-0000-4000-8000-00000000001a',
  permissionProjectionVersionId: '00000000-0000-4000-8000-000000000021',
  authorizedFields: Object.freeze(['region', 'amount', 'year'] as const),
  authorizedJoins: Object.freeze([] as const),
  units: Object.freeze({ amount: 'VND' }),
  grains: Object.freeze(['MONTH'] as const),
});

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    question: 'Doanh so theo vung thang nay?',
    datasetVersionId: authorizedCatalog.datasetVersionId,
    semanticVersionId: authorizedCatalog.semanticVersionId,
    metricVersionId: authorizedCatalog.metricVersionId,
    dimensions: ['region'],
    filters: [{ field: 'year', operator: 'EQ', value: '2026' }],
    timeRange: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
    timeGrain: 'MONTH',
    joins: [],
    units: { amount: 'VND' },
    parameters: {},
    output: { form: 'TABLE', maxRows: 100 },
    assumptions: ['Uses accepted sales dataset only'],
    estimate: { cpuMs: 100, memoryMb: 64 },
    permissionProjectionVersionId: authorizedCatalog.permissionProjectionVersionId,
    ...overrides,
  };
}

function adapter(overrides: Partial<AnalysisAdapterPortV1> = {}): AnalysisAdapterPortV1 {
  return {
    async proposeTypedPlan() {
      return Object.freeze({
        status: 'PROPOSED' as const,
        rationale: 'Bounded narrative only',
        planPatch: Object.freeze({}),
      });
    },
    async isAvailable() {
      return true;
    },
    ...overrides,
  };
}

void test('[DDA-015] rejects generated SQL, code, or authoritative numeric values in proposals', async () => {
  const service = new AnalysisProposalServiceV1(adapter(), authorizedCatalog);
  for (const hostile of [
    baseRequest({ generatedSql: 'SELECT * FROM sales' }),
    baseRequest({ generatedCode: 'print(1)' }),
    baseRequest({ numericValues: [42] }),
    baseRequest({ resultCells: [{ value: 99 }] }),
  ]) {
    const result = await service.propose(context, hostile);
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.code, 'UNSUPPORTED_PLAN');
  }
});

void test('[DDA-015][DDA-016] rejects missing semantic or metric versions', async () => {
  const service = new AnalysisProposalServiceV1(adapter(), authorizedCatalog);
  const missingSemantic = await service.propose(
    context,
    baseRequest({ semanticVersionId: undefined }),
  );
  assert.equal(missingSemantic.accepted, false);
  if (!missingSemantic.accepted) assert.equal(missingSemantic.code, 'INSUFFICIENT_DATA');

  const missingMetric = await service.propose(context, baseRequest({ metricVersionId: undefined }));
  assert.equal(missingMetric.accepted, false);
  if (!missingMetric.accepted) assert.equal(missingMetric.code, 'INSUFFICIENT_DATA');
});

void test('[DDA-015] rejects unauthorized joins and fields', async () => {
  const service = new AnalysisProposalServiceV1(adapter(), authorizedCatalog);
  const badField = await service.propose(
    context,
    baseRequest({ dimensions: ['salary_secret'] }),
  );
  assert.equal(badField.accepted, false);
  if (!badField.accepted) assert.equal(badField.code, 'UNAUTHORIZED_DATA');

  const badJoin = await service.propose(
    context,
    baseRequest({
      joins: [
        {
          leftDatasetVersionId: authorizedCatalog.datasetVersionId,
          rightDatasetVersionId: '00000000-0000-4000-8000-000000000099',
          leftField: 'region',
          rightField: 'region',
        },
      ],
    }),
  );
  assert.equal(badJoin.accepted, false);
  if (!badJoin.accepted) assert.equal(badJoin.code, 'UNAUTHORIZED_DATA');
});

void test('[DDA-015] rejects unbounded outputs and missing units or grain', async () => {
  const service = new AnalysisProposalServiceV1(adapter(), authorizedCatalog);
  const unbounded = await service.propose(
    context,
    baseRequest({ output: { form: 'TABLE', maxRows: 50_000 } }),
  );
  assert.equal(unbounded.accepted, false);
  if (!unbounded.accepted) assert.equal(unbounded.code, 'UNSUPPORTED_PLAN');

  const missingUnits = await service.propose(context, baseRequest({ units: {} }));
  assert.equal(missingUnits.accepted, false);
  if (!missingUnits.accepted) assert.equal(missingUnits.code, 'INSUFFICIENT_DATA');

  const missingGrain = await service.propose(context, baseRequest({ timeGrain: undefined }));
  assert.equal(missingGrain.accepted, false);
  if (!missingGrain.accepted) assert.equal(missingGrain.code, 'INSUFFICIENT_DATA');
});

void test('[DDA-017] requires named alternatives for ambiguous metric or date interpretations', async () => {
  const service = new AnalysisProposalServiceV1(adapter(), authorizedCatalog);
  const ambiguous = await service.propose(
    context,
    baseRequest({
      question: 'Doanh so?',
      ambiguousInterpretations: [
        { name: 'net_revenue', description: 'Net of returns' },
        { name: 'gross_revenue', description: 'Gross before returns' },
      ],
    }),
  );
  assert.equal(ambiguous.accepted, false);
  if (!ambiguous.accepted) {
    assert.equal(ambiguous.code, 'AMBIGUOUS_REQUEST');
    assert.ok(ambiguous.alternatives);
    assert.equal(ambiguous.alternatives.length, 2);
    assert.equal(ambiguous.alternatives[0]?.name, 'net_revenue');
  }
});

void test('[DDA-018] returns stable non-answer reasons for blocked inputs', async () => {
  const service = new AnalysisProposalServiceV1(adapter(), {
    ...authorizedCatalog,
    blockedReason: 'QUALITY_BLOCKED',
  });
  const blocked = await service.propose(context, baseRequest());
  assert.equal(blocked.accepted, false);
  if (!blocked.accepted) assert.equal(blocked.code, 'QUALITY_BLOCKED');
});

void test('[DDA-015][DDA-044] AI unavailable still allows manual typed plan proposal', async () => {
  const service = new AnalysisProposalServiceV1(
    adapter({
      async isAvailable() {
        return false;
      },
      async proposeTypedPlan() {
        throw new Error('ADAPTER_SHOULD_NOT_RUN');
      },
    }),
    authorizedCatalog,
  );
  const result = await service.propose(context, baseRequest({ manualTypedPlan: true }));
  assert.equal(result.accepted, true);
  if (result.accepted) {
    assert.equal(result.value.plan.schemaVersion, 1);
    assert.equal(result.value.adapterUsed, false);
    assert.equal(result.value.plan.output.form, 'TABLE');
  }
});

void test('[DDA-050] recommendations never imply an unexecuted numeric result', async () => {
  const service = new AnalysisProposalServiceV1(adapter(), authorizedCatalog);
  const result = await service.propose(context, baseRequest());
  assert.equal(result.accepted, true);
  if (result.accepted) {
    for (const recommendation of result.value.recommendations) {
      assert.equal(recommendation.impliesExecutedResult, false);
      assert.equal('value' in recommendation, false);
      assert.ok(recommendation.question.length > 0);
    }
  }
});
