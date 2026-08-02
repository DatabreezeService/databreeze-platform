import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InMemorySpreadsheetAuditRepositoryAdapter } from '../../../src/features/sa/adapter/in-memory-spreadsheet-audit-repository.adapter.js';
import { SpreadsheetAuditService } from '../../../src/features/sa/application/spreadsheet-audit.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'spreadsheet-audit-service',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const input = {
  auditId: '55555555-5555-4555-8555-555555555555',
  artifactVersionId: '66666666-6666-4666-8666-666666666666',
  tenantScope: context.tenantScope,
  workbookSha256: 'a'.repeat(64),
  sheets: [
    {
      sheetId: '77777777-7777-4777-8777-777777777777',
      name: 'Orders',
      maxRow: 10,
      maxColumn: 4,
      formulaCount: 2,
    },
  ],
  findings: [
    {
      findingId: '88888888-8888-4888-8888-888888888888',
      sheetId: '77777777-7777-4777-8777-777777777777',
      address: 'C4',
      kind: 'FORMULA_FAMILY_OUTLIER' as const,
      severity: 'WARNING' as const,
      formulaFingerprint: 'b'.repeat(64),
    },
  ],
  blockedReasons: [],
  processorVersion: 'spreadsheet-auditor-0.1.0',
  createdAt: '2026-08-04T00:00:00.000Z',
};

void test('[SA-001, SA-004] service stores immutable, value-free audit results idempotently', async () => {
  const service = new SpreadsheetAuditService(new InMemorySpreadsheetAuditRepositoryAdapter());
  const first = await service.register(context, input);
  assert.equal(first.accepted, true);
  const second = await service.register(context, input);
  assert.deepEqual(second, first);
  const listed = await service.list(context, input.artifactVersionId);
  assert.equal(listed.accepted, true);
  if (listed.accepted) assert.equal(listed.value.length, 1);
});

void test('[SA-005] service rejects a result that broadens the authenticated tenant scope', async () => {
  const service = new SpreadsheetAuditService(new InMemorySpreadsheetAuditRepositoryAdapter());
  const rejected = await service.register(context, {
    ...input,
    tenantScope: {
      scopeType: 'organization',
      organizationId: context.tenantScope.organizationId,
    },
  });
  assert.deepEqual(rejected, { accepted: false, code: 'AUDIT_SCOPE_NARROWING_REQUIRED' });
});

void test('[SA-005] service hides results from a different organization', async () => {
  const service = new SpreadsheetAuditService(new InMemorySpreadsheetAuditRepositoryAdapter());
  await service.register(context, input);
  const otherContextResult = createIamTenantContextV1({
    ...context,
    tenantScope: {
      scopeType: 'organization',
      organizationId: '99999999-9999-4999-8999-999999999999',
    },
    idempotencyKey: 'spreadsheet-audit-other-tenant',
  });
  if (!otherContextResult.accepted) throw new Error('other context invalid');
  assert.deepEqual(await service.find(otherContextResult.value, input.auditId), {
    accepted: false,
    code: 'AUDIT_NOT_FOUND',
  });
});
