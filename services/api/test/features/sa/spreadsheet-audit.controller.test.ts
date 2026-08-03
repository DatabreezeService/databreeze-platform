import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemorySpreadsheetAuditRepositoryAdapter } from '../../../src/features/sa/adapter/in-memory-spreadsheet-audit-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'spreadsheet-audit-http',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const payload = {
  auditId: '55555555-5555-4555-8555-555555555555',
  artifactVersionId: '66666666-6666-4666-8666-666666666666',
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
      address: 'c4',
      kind: 'FORMULA_FAMILY_OUTLIER',
      severity: 'WARNING',
      formulaFingerprint: 'b'.repeat(64),
    },
  ],
  blockedReasons: [],
  processorVersion: 'spreadsheet-auditor-0.1.0',
  createdAt: '2026-08-04T00:00:00.000Z',
};

void test('SA-001/SA-004 HTTP stores value-free audit results and rejects source values', async () => {
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(context),
  };
  const { app } = await createApiApplication({
    spreadsheetAuditRepository: new InMemorySpreadsheetAuditRepositoryAdapter(),
    requestTenantContext,
  });
  try {
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/spreadsheet-audits',
      payload: { ...payload, formula: '=SUM(A1:A3)', sourceValue: '42' },
    });
    assert.equal(rejected.statusCode, 400);
    assert.doesNotMatch(rejected.body, /SUM|42|sourceValue/iu);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/spreadsheet-audits',
      payload,
    });
    assert.equal(created.statusCode, 201);
    assert.match(created.body, /"address":"C4"/u);
    assert.doesNotMatch(created.body, /sourceValue|source value|SUM\(A1:A3\)/iu);

    const found = await app.inject({
      method: 'GET',
      url: `/v1/spreadsheet-audits/${payload.auditId}`,
    });
    assert.equal(found.statusCode, 200);
    assert.match(found.body, /"auditId":"55555555-5555-4555-8555-555555555555"/u);

    const listed = await app.inject({
      method: 'GET',
      url: `/v1/spreadsheet-audits?artifactVersionId=${payload.artifactVersionId}`,
    });
    assert.equal(listed.statusCode, 200);
    assert.match(listed.body, /"accepted":true/u);
  } finally {
    await app.close();
  }
});
