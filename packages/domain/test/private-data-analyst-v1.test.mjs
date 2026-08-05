import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPrivateAnalysisPlanV1,
  executePrivateAnalysisPlanV1,
} from '@databreeze/domain/private-data-analyst/v1';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000701',
  workspaceId: '00000000-0000-4000-8000-000000000702',
};
const id = (suffix) => `00000000-0000-4000-8000-0000000007${suffix}`;

void test('[PDA-007, PDA-009, PDA-014, PDA-016] executes a typed deterministic analysis plan', () => {
  const plan = createPrivateAnalysisPlanV1({
    planId: id('03'),
    planVersion: 1,
    tenantScope: scope,
    question: 'Revenue by region',
    datasetVersionId: id('04'),
    semanticVersionId: id('05'),
    dimensions: ['region'],
    metric: { field: 'revenue', operation: 'SUM' },
    outputLimit: 20,
  });
  assert.equal(plan.accepted, true);
  if (!plan.accepted) return;
  const result = executePrivateAnalysisPlanV1(plan.value, [
    { region: 'North', revenue: 10 },
    { region: 'North', revenue: 5 },
    { region: 'South', revenue: 7 },
  ]);
  assert.equal(result.status, 'READY');
  if (result.status === 'READY') {
    assert.deepEqual(result.rows, [
      { region: 'North', value: 15 },
      { region: 'South', value: 7 },
    ]);
    assert.equal(result.egressState, 'LOCAL_ONLY');
    const reversed = executePrivateAnalysisPlanV1(plan.value, [
      { region: 'South', revenue: 7 },
      { region: 'North', revenue: 5 },
      { region: 'North', revenue: 10 },
    ]);
    assert.deepEqual(reversed.rows, result.rows);
  }
});

void test('[PDA-013, PDA-018] rejects unbounded or unknown plan operations', () => {
  const plan = createPrivateAnalysisPlanV1({
    planId: id('06'),
    planVersion: 1,
    tenantScope: scope,
    question: 'bad',
    datasetVersionId: id('07'),
    semanticVersionId: id('08'),
    dimensions: ['region'],
    metric: { field: 'region', operation: 'SQL' },
    outputLimit: 100_000,
  });
  assert.equal(plan.accepted, false);
});
