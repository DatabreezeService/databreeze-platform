import assert from 'node:assert/strict';
import test from 'node:test';

import { compareQuoteIntelligenceV1 } from '@databreeze/domain/quote-intelligence/v1';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000301',
  workspaceId: '00000000-0000-4000-8000-000000000302',
};
const id = (suffix) => `00000000-0000-4000-8000-0000000003${suffix}`;
const evidence = [{ sourceId: id('03'), locator: 'quote.pdf:page=1:line=1' }];

void test('[QI-001, QI-010, QI-012, QI-014] normalizes landed cost and deterministic scoring', () => {
  const result = compareQuoteIntelligenceV1({
    comparisonId: id('04'),
    tenantScope: scope,
    targetCurrency: 'USD',
    exchangeRates: [
      {
        rateId: id('05'),
        from: 'EUR',
        to: 'USD',
        rate: 1.1,
        effectiveDate: '2026-01-01',
        provenance: 'treasury-v1',
      },
    ],
    quotes: [
      {
        supplierId: id('06'),
        supplierName: 'Alpha',
        evidence,
        freight: 10,
        leadDays: 5,
        lines: [
          {
            lineId: id('07'),
            description: 'Widget',
            quantity: 2,
            unitPrice: 100,
            currency: 'EUR',
            taxRate: 0.1,
            evidence,
          },
        ],
      },
      {
        supplierId: id('08'),
        supplierName: 'Beta',
        evidence,
        freight: 0,
        leadDays: 9,
        lines: [
          {
            lineId: id('09'),
            description: 'Widget',
            quantity: 2,
            unitPrice: 120,
            currency: 'EUR',
            taxRate: 0.1,
            evidence,
          },
        ],
      },
    ],
    scoring: {
      policyVersion: 1,
      criteria: [
        {
          key: 'leadDays',
          direction: 'LOWER_BETTER',
          weight: 1,
          values: { [id('06')]: 5, [id('08')]: 9 },
        },
      ],
    },
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.equal(result.suppliers[0]?.targetCurrency, 'USD');
  assert.equal(result.suppliers[0]?.landedCost, 253);
  assert.equal(result.suppliers[0]?.score, 1);
  assert.equal(result.candidateSupplierId, id('06'));
  assert.equal(result.requiresHumanApproval, true);
});

void test('[QI-011, QI-018] blocks incomplete quotes without assuming missing values are zero', () => {
  const result = compareQuoteIntelligenceV1({
    comparisonId: id('10'),
    tenantScope: scope,
    targetCurrency: 'USD',
    quotes: [
      {
        supplierId: id('11'),
        supplierName: 'Incomplete',
        evidence,
        freight: 0,
        leadDays: 4,
        lines: [
          {
            lineId: id('12'),
            description: 'Widget',
            quantity: 1,
            unitPrice: 20,
            currency: 'GBP',
            taxRate: 0,
            evidence,
          },
        ],
      },
    ],
  });
  assert.equal(result.status, 'BLOCKED');
  if (result.status === 'BLOCKED') assert.ok(result.reasons.includes('MISSING_EXCHANGE_RATE'));
});
