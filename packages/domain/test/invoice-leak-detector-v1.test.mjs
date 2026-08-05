import assert from 'node:assert/strict';
import test from 'node:test';

import { auditInvoiceLeakV1 } from '@databreeze/domain/invoice-leak-detector/v1';

const id = (suffix) => `00000000-0000-4000-8000-0000000004${suffix}`;
const evidence = [{ sourceId: id('01'), locator: 'invoice.pdf:page=1:line=1' }];

function invoice(overrides = {}) {
  return {
    invoiceId: id('02'),
    artifactVersionId: id('03'),
    contentSha256: 'a'.repeat(64),
    supplierId: id('04'),
    invoiceNumber: 'INV-1',
    invoiceDate: '2026-07-01',
    currency: 'USD',
    total: 220,
    evidence,
    lines: [
      {
        lineId: id('05'),
        description: 'Widget',
        quantity: 2,
        unitPrice: 110,
        currency: 'USD',
        evidence,
      },
    ],
    ...overrides,
  };
}

void test('[ILD-001, ILD-008, ILD-012, ILD-015] detects deterministic price and quantity exposure with evidence', () => {
  const result = auditInvoiceLeakV1({
    invoice: invoice(),
    governingLines: [
      {
        governingLineId: id('06'),
        supplierId: id('04'),
        description: 'Widget',
        unitPrice: 100,
        currency: 'USD',
        maxQuantity: 1,
        evidence,
      },
    ],
    calculationVersion: 'ild-1',
  });
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.equal(result.findings.length, 2);
  assert.equal(result.findings[0]?.disposition, 'ESTIMATED');
  assert.equal(result.findings[0]?.evidence.length, 3);
  assert.equal(result.expectedTotal, 100);
});

void test('[ILD-010, ILD-011] detects duplicate invoices from immutable artifact/content signals', () => {
  const first = invoice();
  const result = auditInvoiceLeakV1({
    invoice: first,
    governingLines: [],
    historicalInvoices: [first],
  });
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.findings.some((finding) => finding.type === 'DUPLICATE_INVOICE'));
});

void test('[ILD-014] reports incomplete governing data rather than assuming an entitlement', () => {
  const result = auditInvoiceLeakV1({ invoice: invoice(), governingLines: [] });
  assert.equal(result.expectedTotal, null);
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.ok(result.findings.some((finding) => finding.type === 'UNRESOLVED_GOVERNING_DATA'));
});
