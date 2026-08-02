import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createDatasetVersionManifestV1 } from '@databreeze/domain/dataset-governance/v1';
import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryDatasetExportRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-export-repository.adapter.js';
import { InMemoryDatasetVersionRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-version-repository.adapter.js';
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
  idempotencyKey: 'dataset-export-http',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const tenantContext = contextResult.value;

void test('DSM-022 export endpoint accepts verification metadata and rejects raw rows', async () => {
  const versions = new InMemoryDatasetVersionRepositoryAdapter();
  const version = createDatasetVersionManifestV1({
    datasetId: '55555555-5555-4555-8555-555555555555',
    versionId: '66666666-6666-4666-8666-666666666666',
    tenantScope: tenantContext.tenantScope,
    inputArtifactVersionIds: [],
    schemaVersionId: '77777777-7777-4777-8777-777777777777',
    mappingVersionId: '88888888-8888-4888-8888-888888888888',
    ruleSetVersionId: '99999999-9999-4999-8999-999999999999',
    engineBuild: 'engine-1',
    contentFingerprint: 'a'.repeat(64),
    rowCount: 2,
    qualityState: 'PASS',
    lineageManifestHash: 'b'.repeat(64),
  });
  assert.equal(version.accepted, true);
  if (!version.accepted) return;
  await versions.save(tenantContext, version.value);
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    datasetVersionRepository: versions,
    datasetExportRepository: new InMemoryDatasetExportRepositoryAdapter(),
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/dataset-exports',
      payload: {
        manifestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        datasetId: '55555555-5555-4555-8555-555555555555',
        datasetVersionId: '66666666-6666-4666-8666-666666666666',
        dataMode: 'HYBRID',
        payloadClass: 'GOVERNED_DATA',
        format: 'CSV',
        rowCount: 2,
        byteSize: 100,
        contentSha256: 'c'.repeat(64),
        schemaVersionId: '77777777-7777-4777-8777-777777777777',
        mappingVersionId: '88888888-8888-4888-8888-888888888888',
        ruleSetVersionId: '99999999-9999-4999-8999-999999999999',
        semanticManifestHash: 'd'.repeat(64),
        metricManifestHash: 'e'.repeat(64),
        qualityManifestHash: 'f'.repeat(64),
        lineageManifestHash: '0'.repeat(64),
        evidenceManifestHash: '1'.repeat(64),
        policyHash: '2'.repeat(64),
        qualityState: 'PASS',
        approvalState: 'NOT_REQUIRED',
        createdAt: '2026-08-04T00:00:00.000Z',
        rows: [{ forbidden: 'source value' }],
      },
    });
    assert.equal(response.statusCode, 400);
    const valid = await app.inject({
      method: 'POST',
      url: '/v1/dataset-exports',
      payload: {
        manifestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        datasetId: '55555555-5555-4555-8555-555555555555',
        datasetVersionId: '66666666-6666-4666-8666-666666666666',
        dataMode: 'HYBRID',
        payloadClass: 'GOVERNED_DATA',
        format: 'CSV',
        rowCount: 2,
        byteSize: 100,
        contentSha256: 'c'.repeat(64),
        schemaVersionId: '77777777-7777-4777-8777-777777777777',
        mappingVersionId: '88888888-8888-4888-8888-888888888888',
        ruleSetVersionId: '99999999-9999-4999-8999-999999999999',
        semanticManifestHash: 'd'.repeat(64),
        metricManifestHash: 'e'.repeat(64),
        qualityManifestHash: 'f'.repeat(64),
        lineageManifestHash: '0'.repeat(64),
        evidenceManifestHash: '1'.repeat(64),
        policyHash: '2'.repeat(64),
        qualityState: 'PASS',
        approvalState: 'NOT_REQUIRED',
        createdAt: '2026-08-04T00:00:00.000Z',
      },
    });
    assert.equal(valid.statusCode, 201);
    assert.doesNotMatch(valid.body, /source value|rows/iu);
  } finally {
    await app.close();
  }
});
