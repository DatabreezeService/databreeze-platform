import assert from 'node:assert/strict';
import test from 'node:test';

import { createDdaAnalysisPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';

import { AnalysisExecutionServiceV1 } from '../../../src/features/dda/analyst/application/analysis-execution.service.js';
import type { DeterministicResultPortV1 } from '../../../src/features/dda/analyst/application/deterministic-result.port.js';
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
  idempotencyKey: 'dda-analysis-execution',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const hash = 'a'.repeat(64);
const planResult = createDdaAnalysisPlanV1({
  planId: '00000000-0000-4000-8000-000000000010',
  planVersionId: '00000000-0000-4000-8000-000000000011',
  tenantScope: scope,
  datasetVersionId: '00000000-0000-4000-8000-000000000018',
  semanticVersionId: '00000000-0000-4000-8000-000000000019',
  metricVersionId: '00000000-0000-4000-8000-00000000001a',
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
  permissionProjectionVersionId: '00000000-0000-4000-8000-000000000021',
  planHash: hash,
  createdAt: '2026-08-10T10:00:00.000Z',
});
if (!planResult.accepted) throw new Error('fixture plan invalid');
const plan = planResult.value;

void test('[DDA-015][DDA-019] execution supplies numbers only from deterministic result cells with provenance', async () => {
  const port: DeterministicResultPortV1 = {
    async execute() {
      return Object.freeze({
        resultId: '00000000-0000-4000-8000-000000000030',
        cells: Object.freeze([
          Object.freeze({
            cellId: '00000000-0000-4000-8000-000000000031',
            field: 'amount',
            value: 1_250_000,
            unit: 'VND',
            planVersionId: plan.planVersionId,
            metricVersionId: plan.metricVersionId,
          }),
        ]),
        provenance: Object.freeze({
          planVersionId: plan.planVersionId,
          datasetVersionId: plan.datasetVersionId,
          engineVersion: 'engine-1.0.0',
        }),
      });
    },
  };
  const service = new AnalysisExecutionServiceV1(port);
  const executed = await service.execute(context, {
    plan,
    narrativeClaims: [
      {
        text: 'Doanh so vung Bac la cao nhat',
        resultCellIds: ['00000000-0000-4000-8000-000000000031'],
      },
    ],
  });
  assert.equal(executed.accepted, true);
  if (executed.accepted) {
    assert.equal(executed.value.cells[0]?.value, 1_250_000);
    assert.equal(executed.value.cells[0]?.planVersionId, plan.planVersionId);
    assert.equal(executed.value.narrative[0]?.resultCellIds.length, 1);
  }
});

void test('[DDA-019] rejects narrative claims without result-cell references', async () => {
  const port: DeterministicResultPortV1 = {
    async execute() {
      return Object.freeze({
        resultId: '00000000-0000-4000-8000-000000000030',
        cells: Object.freeze([
          Object.freeze({
            cellId: '00000000-0000-4000-8000-000000000031',
            field: 'amount',
            value: 10,
            unit: 'VND',
            planVersionId: plan.planVersionId,
            metricVersionId: plan.metricVersionId,
          }),
        ]),
        provenance: Object.freeze({
          planVersionId: plan.planVersionId,
          datasetVersionId: plan.datasetVersionId,
          engineVersion: 'engine-1.0.0',
        }),
      });
    },
  };
  const service = new AnalysisExecutionServiceV1(port);
  const rejected = await service.execute(context, {
    plan,
    narrativeClaims: [{ text: 'Doanh so tang', resultCellIds: [] }],
  });
  assert.equal(rejected.accepted, false);
  if (!rejected.accepted) assert.equal(rejected.code, 'UNSUPPORTED_PLAN');
});

void test('[DDA-018] surfaces SOURCE_UNAVAILABLE from deterministic port', async () => {
  const port: DeterministicResultPortV1 = {
    async execute() {
      return Object.freeze({ status: 'SOURCE_UNAVAILABLE' as const });
    },
  };
  const service = new AnalysisExecutionServiceV1(port);
  const result = await service.execute(context, { plan, narrativeClaims: [] });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'SOURCE_UNAVAILABLE');
});

void test('[DDA-044] budget denial returns stable non-answer reason', async () => {
  const port: DeterministicResultPortV1 = {
    async execute() {
      return Object.freeze({ status: 'BUDGET_DENIED' as const });
    },
  };
  const service = new AnalysisExecutionServiceV1(port);
  const result = await service.execute(context, { plan, narrativeClaims: [] });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'BUDGET_DENIED');
});
