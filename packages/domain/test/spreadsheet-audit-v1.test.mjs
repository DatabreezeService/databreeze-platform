import assert from 'node:assert/strict';
import test from 'node:test';

import { createSpreadsheetAuditResultV1 } from '../dist/spreadsheet-audit/v1.js';

const sheetId = '11111111-1111-4111-8111-111111111111';
const base = {
  auditId: '22222222-2222-4222-8222-222222222222',
  artifactVersionId: '33333333-3333-4333-8333-333333333333',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '44444444-4444-4444-8444-444444444444',
    workspaceId: '55555555-5555-4555-8555-555555555555',
  },
  workbookSha256: 'a'.repeat(64),
  sheets: [{ sheetId, name: 'Inventory', maxRow: 10, maxColumn: 4, formulaCount: 3 }],
  findings: [
    {
      findingId: '66666666-6666-4666-8666-666666666666',
      sheetId,
      address: 'c1',
      kind: 'FORMULA_FAMILY_OUTLIER',
      severity: 'WARNING',
      formulaFingerprint: 'b'.repeat(64),
    },
  ],
  blockedReasons: ['MACRO'],
  processorVersion: 'spreadsheet-auditor@1.0.0',
  createdAt: '2026-08-04T00:00:00.000Z',
};

void test('[SA-001, SA-004] audit results retain exact value-free evidence coordinates', () => {
  const result = createSpreadsheetAuditResultV1(base);
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.findings[0]?.address, 'C1');
  assert.equal(Object.hasOwn(result.value.findings[0], 'formula'), false);
  assert.equal(Object.hasOwn(result.value.findings[0], 'sourceValue'), false);
});

void test('[SA-005] findings cannot reference an unknown sheet or duplicate IDs', () => {
  assert.deepEqual(
    createSpreadsheetAuditResultV1({
      ...base,
      findings: [{ ...base.findings[0], sheetId: '77777777-7777-4777-8777-777777777777' }],
    }),
    { accepted: false, code: 'INVALID_IDENTIFIER' },
  );
  assert.deepEqual(
    createSpreadsheetAuditResultV1({
      ...base,
      findings: [base.findings[0], base.findings[0]],
    }),
    { accepted: false, code: 'DUPLICATE_IDENTIFIER' },
  );
});

void test('[SA-006] findings must stay inside the exact sheet geometry', () => {
  assert.deepEqual(
    createSpreadsheetAuditResultV1({
      ...base,
      findings: [{ ...base.findings[0], address: 'E1' }],
    }),
    { accepted: false, code: 'INVALID_COORDINATE' },
  );
  assert.deepEqual(
    createSpreadsheetAuditResultV1({
      ...base,
      findings: [{ ...base.findings[0], address: 'A11' }],
    }),
    { accepted: false, code: 'INVALID_COORDINATE' },
  );
});

void test('[SA-004] finding validation preserves structural error codes', () => {
  for (const [finding, code] of [
    [{ ...base.findings[0], address: 'not-a-cell' }, 'INVALID_COORDINATE'],
    [{ ...base.findings[0], severity: 'CRITICAL' }, 'INVALID_SEVERITY'],
    [{ ...base.findings[0], kind: 'UNKNOWN' }, 'INVALID_KIND'],
  ]) {
    assert.deepEqual(createSpreadsheetAuditResultV1({ ...base, findings: [finding] }), {
      accepted: false,
      code,
    });
  }
});
