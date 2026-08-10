import assert from 'node:assert/strict';
import test from 'node:test';

import { DashboardComparisonServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-comparison.service.js';

void test('[DDA-047] compares compatible snapshots with null/zero percentage rules and disclosures', () => {
  const service = new DashboardComparisonServiceV1();
  const compared = service.compare({
    left: {
      snapshotId: '00000000-0000-4000-8000-000000000029',
      dashboardVersionId: '00000000-0000-4000-8000-000000000011',
      values: { amount: 100, returns: 0 },
      widgets: ['kpi-1'],
      inputs: ['dataset-a'],
    },
    right: {
      snapshotId: '00000000-0000-4000-8000-00000000002a',
      dashboardVersionId: '00000000-0000-4000-8000-000000000012',
      values: { amount: 150, returns: null },
      widgets: ['kpi-1', 'bar-1'],
      inputs: ['dataset-a', 'dataset-b'],
    },
  });
  assert.equal(compared.accepted, true);
  if (!compared.accepted) return Promise.resolve();
  assert.equal(compared.value.changes['amount']?.absolute, 50);
  assert.equal(compared.value.changes['amount']?.percentage, 50);
  assert.equal(compared.value.changes['returns']?.percentage, null);
  assert.deepEqual(compared.value.changedWidgets, ['bar-1']);
  assert.deepEqual(compared.value.changedInputs, ['dataset-b']);
});

void test('[DDA-047] rejects incompatible snapshot comparisons', () => {
  const service = new DashboardComparisonServiceV1();
  const rejected = service.compare({
    left: {
      snapshotId: 'a',
      dashboardVersionId: 'v1',
      values: { amount: 1 },
      widgets: [],
      inputs: [],
      schemaFamily: 'sales',
    },
    right: {
      snapshotId: 'b',
      dashboardVersionId: 'v2',
      values: { amount: 2 },
      widgets: [],
      inputs: [],
      schemaFamily: 'expenses',
    },
  });
  assert.equal(rejected.accepted, false);
  if (!rejected.accepted) assert.equal(rejected.code, 'INCOMPATIBLE_SNAPSHOTS');
});
