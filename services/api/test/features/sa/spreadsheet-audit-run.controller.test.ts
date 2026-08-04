import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createArtifactVersionV1, createContentPlacementV1 } from '@databreeze/domain/artifact/v1';
import { createApiApplication } from '../../../src/bootstrap.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
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

const otherContextResult = createIamTenantContextV1({
  ...context,
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  },
  idempotencyKey: 'sa-run-foreign-seed',
});
if (!otherContextResult.accepted) throw new Error('foreign fixture context invalid');

async function seedArtifact(
  repository: InMemoryArtifactRepositoryAdapter,
  tenant: typeof context,
  versionId: string,
  options: { readonly scanState?: 'PENDING' | 'CLEAN'; readonly available?: boolean } = {},
) {
  const version = createArtifactVersionV1({
    artifactId: '99999999-9999-4999-8999-999999999999',
    versionId,
    tenantScope: tenant.tenantScope,
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    byteSize: 128,
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    displayName: 'orders.xlsx',
    createdAt: '2026-08-04T00:00:00.000Z',
    status: 'ACTIVE',
    scanState: options.scanState ?? 'CLEAN',
  });
  if (!version.accepted) throw new Error(`artifact fixture rejected: ${version.code}`);
  await repository.saveVersion(tenant, version.value);
  const placement = createContentPlacementV1({
    placementId: versionId,
    artifactVersion: version.value,
    tenantScope: tenant.tenantScope,
    kind: 'LOCAL',
    opaqueReference: 'local-placement-0001',
    contentSha256: version.value.contentSha256,
    available: options.available ?? true,
  });
  if (!placement.accepted) throw new Error(`placement fixture rejected: ${placement.code}`);
  await repository.savePlacement(tenant, placement.value);
}

void test('[SA-001] HTTP admits a content-free Spreadsheet Auditor run idempotently', async () => {
  const repository = new InMemorySpreadsheetAuditRunRepositoryAdapter();
  const artifactRepository = new InMemoryArtifactRepositoryAdapter();
  await seedArtifact(artifactRepository, context, '55555555-5555-4555-8555-555555555555');
  await seedArtifact(artifactRepository, context, '66666666-6666-4666-8666-666666666666', {
    scanState: 'PENDING',
  });
  await seedArtifact(artifactRepository, context, '77777777-7777-4777-8777-777777777777', {
    available: false,
  });
  await seedArtifact(
    artifactRepository,
    otherContextResult.value,
    '88888888-8888-4888-8888-888888888888',
  );
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(context),
  };
  const { app } = await createApiApplication({
    spreadsheetAuditRunRepository: repository,
    artifactRepository,
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
    const createdBody = JSON.parse(created.body) as {
      readonly value: { readonly runId: string };
    };

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
    const replayBody = JSON.parse(replay.body) as {
      readonly value: { readonly runId: string };
    };
    assert.equal(replayBody.value.runId, createdBody.value.runId);

    const found = await app.inject({
      method: 'GET',
      url: `/v1/spreadsheet-audit-runs/${createdBody.value.runId}`,
    });
    assert.equal(found.statusCode, 200);
    assert.match(found.body, /"jobId"/u);

    for (const artifactVersionId of [
      '99999999-9999-4999-8999-999999999999',
      '88888888-8888-4888-8888-888888888888',
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777',
    ]) {
      const unavailable = await app.inject({
        method: 'POST',
        url: '/v1/spreadsheet-audit-runs',
        headers: { 'idempotency-key': `sa-run-http-${artifactVersionId}` },
        payload: { artifactVersionId, processorVersion: 'spreadsheet-auditor-0.1.0' },
      });
      assert.equal(unavailable.statusCode, 201);
      assert.match(unavailable.body, /"accepted":false/u);
      assert.match(unavailable.body, /SA_RUN_ARTIFACT_UNAVAILABLE/u);
    }
  } finally {
    await app.close();
  }
});
