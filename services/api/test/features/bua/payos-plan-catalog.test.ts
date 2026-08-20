import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findPayosPlan,
  listPayosPlans,
} from '../../../src/features/bua/application/payos-plan-catalog.js';

void test('[BUA-001/002] marketing catalog prices remain server-owned and complete', () => {
  const plans = listPayosPlans();
  assert.deepEqual(
    plans.map((plan) => [plan.id, plan.amountVnd]),
    [
      ['personal-monthly', 149_000],
      ['personal-annual', 1_490_000],
      ['professional-monthly', 399_000],
      ['professional-annual', 3_990_000],
      ['team-monthly', 999_000],
      ['team-annual', 9_990_000],
    ],
  );
  assert.equal(findPayosPlan('not-a-plan'), undefined);
  assert.equal(findPayosPlan('team-monthly')?.allowances.governedStorageGb, 250);
});
