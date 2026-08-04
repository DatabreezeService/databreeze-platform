import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemorySpreadsheetAuditRunRepositoryAdapter } from '../../../src/features/sa/adapter/in-memory-spreadsheet-audit-run-repository.adapter.js';
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
  idempotencyKey: 'sa-run-http',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

void test('[SA-001] HTTP admits a content-free Spreadsheet Auditor run idempotently', async () => {
  const repository = new InMemorySpreadsheetAuditRunRepositoryAdapter();
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(context),
  };
  const { app } = await createApiApplication({
    spreadsheetAuditRunRepository: repository,
    requestTenantContext,
  });
  try {
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/spreadsheet-audit-runs',
      headers: { 'idempotency-key': 'sa-run-http' },
      payload: {
        artifactVersionId: '55555555-5555-4555-8555-555555555555',
        processorVersion: 'spreadsheet-auditor-0.1.0',
        sourcePath: 'C:\\Users\\alice\\orders.xlsx',
      },
    });
    assert.equal(rejected.statusCode, 400);
    assert.doesNotMatch(rejected.body, /orders\.xlsx/iu);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/spreadsheet-audit-runs',
      headers: { 'idempotency-key': 'sa-run-http' },
      payload: {
        artifactVersionId: '55555555-5555-4555-8555-555555555555',
        processorVersion: 'spreadsheet-auditor-0.1.0',
      },
    });
    assert.equal(created.statusCode, 201);
    assert.match(created.body, /"accepted":true/u);
    assert.match(created.body, /"state":"ADMITTED"/u);
    assert.doesNotMatch(created.body, /tenantScope|idempotencyKey|sourcePath/iu);

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/spreadsheet-audit-runs',
      headers: { 'idempotency-key': 'sa-run-http' },
      payload: {
        artifactVersionId: '55555555-5555-4555-8555-555555555555',
        processorVersion: 'spreadsheet-auditor-0.1.0',
      },
    });
    assert.equal(replay.statusCode, 201);
    assert.equal(JSON.parse(replay.body).value.runId, JSON.parse(created.body).value.runId);

    const found = await app.inject({
      method: 'GET',
      url: `/v1/spreadsheet-audit-runs/${JSON.parse(created.body).value.runId}`,
    });
    assert.equal(found.statusCode, 200);
    assert.match(found.body, /"jobId"/u);
  } finally {
    await app.close();
  }
});
