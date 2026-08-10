import assert from 'node:assert/strict';
import test from 'node:test';

import { ReceiptValidationService } from '../../../src/features/dda/receipt/application/receipt-validation.service.js';

void test('[DDA-042] reconciles subtotal tax total within declared rounding tolerance', () => {
  const service = new ReceiptValidationService({ roundingToleranceMinorUnits: 1 });
  const ok = service.validate({
    merchant: 'Cafe',
    transactionDateTime: '2026-08-10T10:15:00Z',
    currency: 'VND',
    subtotal: '100000',
    tax: '20000',
    total: '120000',
    fieldConfidence: { merchant: 90, total: 95, currency: 97, subtotal: 88, tax: 84 },
  });
  assert.equal(ok.accepted, true);

  const mismatch = service.validate({
    merchant: 'Cafe',
    transactionDateTime: '2026-08-10T10:15:00Z',
    currency: 'VND',
    subtotal: '100000',
    tax: '20000',
    total: '130000',
    fieldConfidence: { merchant: 90, total: 95, currency: 97, subtotal: 88, tax: 84 },
  });
  assert.equal(mismatch.accepted, false);
  if (mismatch.accepted) return;
  assert.equal(mismatch.code, 'TOTAL_MISMATCH');
  assert.equal(mismatch.requiresReview, true);
});

void test('[DDA-042] enforces required fields currency date and negative zero policy', () => {
  const service = new ReceiptValidationService();
  assert.equal(
    service.validate({
      merchant: '',
      transactionDateTime: '2026-08-10T10:15:00Z',
      currency: 'VND',
      subtotal: '1',
      tax: '0',
      total: '1',
      fieldConfidence: {},
    }).accepted,
    false,
  );
  assert.equal(
    service.validate({
      merchant: 'Cafe',
      transactionDateTime: 'not-a-date',
      currency: 'VND',
      subtotal: '1',
      tax: '0',
      total: '1',
      fieldConfidence: {},
    }).accepted,
    false,
  );
  assert.equal(
    service.validate({
      merchant: 'Cafe',
      transactionDateTime: '2026-08-10T10:15:00Z',
      currency: 'XYZ',
      subtotal: '1',
      tax: '0',
      total: '1',
      fieldConfidence: {},
    }).accepted,
    false,
  );
  assert.equal(
    service.validate({
      merchant: 'Cafe',
      transactionDateTime: '2026-08-10T10:15:00Z',
      currency: 'VND',
      subtotal: '-1',
      tax: '0',
      total: '-1',
      fieldConfidence: {},
    }).accepted,
    false,
  );
  assert.equal(
    service.validate({
      merchant: 'Cafe',
      transactionDateTime: '2026-08-10T10:15:00Z',
      currency: 'VND',
      subtotal: '0',
      tax: '0',
      total: '0',
      fieldConfidence: {},
    }).accepted,
    false,
  );
});

void test('[DDA-042] optional line items must reconcile to subtotal when present', () => {
  const service = new ReceiptValidationService();
  const ok = service.validate({
    merchant: 'Cafe',
    transactionDateTime: '2026-08-10T10:15:00Z',
    currency: 'VND',
    subtotal: '100000',
    tax: '20000',
    total: '120000',
    lineItems: [
      { description: 'Coffee', amount: '60000' },
      { description: 'Pastry', amount: '40000' },
    ],
    fieldConfidence: { merchant: 90, total: 95 },
  });
  assert.equal(ok.accepted, true);
  const bad = service.validate({
    merchant: 'Cafe',
    transactionDateTime: '2026-08-10T10:15:00Z',
    currency: 'VND',
    subtotal: '100000',
    tax: '20000',
    total: '120000',
    lineItems: [{ description: 'Coffee', amount: '50000' }],
    fieldConfidence: { merchant: 90, total: 95 },
  });
  assert.equal(bad.accepted, false);
  if (bad.accepted) return;
  assert.equal(bad.code, 'LINE_ITEM_MISMATCH');
});

void test('[DDA-042] probable duplicates stay review candidates and are not silent deletions', () => {
  const service = new ReceiptValidationService();
  const first = {
    artifactContentHash: 'a'.repeat(64),
    merchant: 'Cafe',
    transactionDateTime: '2026-08-10T10:15:00Z',
    currency: 'VND',
    subtotal: '100000',
    tax: '20000',
    total: '120000',
    paymentReference: 'REF-1',
    fieldConfidence: { merchant: 90, total: 95 },
  };
  const exact = service.detectDuplicate(first, [first]);
  assert.equal(exact.probableDuplicate, true);
  assert.equal(exact.reason, 'EXACT_ARTIFACT_HASH');
  assert.equal(exact.action, 'REVIEW_REQUIRED');

  const signal = service.detectDuplicate(
    { ...first, artifactContentHash: 'b'.repeat(64) },
    [{ ...first, artifactContentHash: 'c'.repeat(64) }],
  );
  assert.equal(signal.probableDuplicate, true);
  assert.equal(signal.reason, 'MERCHANT_DATE_TOTAL_REFERENCE');
  assert.equal(signal.action, 'REVIEW_REQUIRED');
});

void test('[DDA-042] low confidence and conflicting candidates require review', () => {
  const service = new ReceiptValidationService({ lowConfidenceThreshold: 85 });
  const low = service.validate({
    merchant: 'Cafe',
    transactionDateTime: '2026-08-10T10:15:00Z',
    currency: 'VND',
    subtotal: '100000',
    tax: '20000',
    total: '120000',
    fieldConfidence: { merchant: 90, total: 70 },
  });
  assert.equal(low.accepted, false);
  if (low.accepted) return;
  assert.equal(low.code, 'LOW_CONFIDENCE_REVIEW');
  assert.equal(low.requiresReview, true);

  const conflict = service.validate({
    merchant: 'Cafe',
    transactionDateTime: '2026-08-10T10:15:00Z',
    currency: 'VND',
    subtotal: '100000',
    tax: '20000',
    total: '120000',
    conflictingCandidateTotals: ['120000', '125000'],
    fieldConfidence: { merchant: 90, total: 95 },
  });
  assert.equal(conflict.accepted, false);
  if (conflict.accepted) return;
  assert.equal(conflict.code, 'CONFLICTING_CANDIDATES');
});
