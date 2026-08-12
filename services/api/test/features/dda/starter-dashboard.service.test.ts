import assert from 'node:assert/strict';
import test from 'node:test';

import { StarterDashboardTemplateRegistry } from '../../../src/features/dda/dashboard/application/starter-dashboard-template.registry.js';

void test('[DDA-054] matches sales time-series and expense profiles deterministically', () => {
  const registry = new StarterDashboardTemplateRegistry();
  const sales = registry.match({
    profile: 'SALES_TIME_SERIES',
    roles: Object.freeze({ measure: 'revenue', time: 'order_date', category: 'store' }),
    units: Object.freeze({ revenue: 'VND' }),
    grains: Object.freeze(['DAY', 'MONTH']),
  });
  assert.equal(sales.accepted, true);
  if (!sales.accepted) return;
  assert.equal(sales.value.templateId, 'starter.sales.timeseries.v1');
  assert.equal(sales.value.aiUsed, false);

  const expense = registry.match({
    profile: 'EXPENSE_RECEIPT',
    roles: Object.freeze({ measure: 'amount', time: 'receipt_date', category: 'merchant' }),
    units: Object.freeze({ amount: 'VND' }),
    grains: Object.freeze(['DAY']),
  });
  assert.equal(expense.accepted, true);
  if (!expense.accepted) return;
  assert.equal(expense.value.templateId, 'starter.expense.receipt.v1');
});

void test('[DDA-054] returns NO_SAFE_TEMPLATE when required roles are missing', () => {
  const registry = new StarterDashboardTemplateRegistry();
  const result = registry.match({
    profile: 'SALES_TIME_SERIES',
    roles: Object.freeze({ measure: 'revenue' }),
    units: Object.freeze({ revenue: 'VND' }),
    grains: Object.freeze(['DAY']),
  });
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.code, 'NO_SAFE_TEMPLATE');
});

void test('[DDA-054] never calls an AI provider path', () => {
  const registry = new StarterDashboardTemplateRegistry();
  assert.equal(registry.isAiAuthoritative(), false);
  const generic = registry.match({
    profile: 'GENERIC_TABLE',
    roles: Object.freeze({ measure: 'value', category: 'label' }),
    units: Object.freeze({ value: 'COUNT' }),
    grains: Object.freeze(['DAY']),
  });
  assert.equal(generic.accepted, true);
  if (!generic.accepted) return;
  assert.equal(generic.value.aiUsed, false);
  for (const widget of generic.value.widgets) {
    assert.ok(
      ['KPI', 'TABLE', 'BAR', 'LINE', 'AREA', 'DONUT', 'TEXT_EVIDENCE'].includes(widget.type),
    );
  }
});
