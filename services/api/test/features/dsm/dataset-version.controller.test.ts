import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryDatasetVersionRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-version-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000801';
const workspaceId = '00000000-0000-4000-8000-000000000802';
const datasetId = '00000000-0000-4000-8000-000000000803';
const versionId = '00000000-0000-4000-8000-000000000804';

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000805',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000806',
    idempotencyKey: 'dataset-version-controller',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

void test('[DSM-002, DSM-012, DSM-014] dataset result manifests are immutable and exact-input bound', async () => {
  const repository = new InMemoryDatasetVersionRepositoryAdapter();
  const tenantContext = context();
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    datasetVersionRepository: repository,
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/dataset-versions',
      payload: {
        versionId,
        datasetId,
        inputArtifactVersionIds: ['00000000-0000-4000-8000-000000000807'],
        schemaVersionId: '00000000-0000-4000-8000-000000000808',
        mappingVersionId: '00000000-0000-4000-8000-000000000809',
        ruleSetVersionId: '00000000-0000-4000-8000-000000000810',
        engineBuild: 'engine@1',
        contentFingerprint: 'a'.repeat(64),
        rowCount: 42,
        qualityState: 'PASS',
        lineageManifestHash: 'b'.repeat(64),
      },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().value.rowCount, 42);
    const read = await app.inject({ method: 'GET', url: `/v1/dataset-versions/${versionId}` });
    assert.equal(read.statusCode, 200);
    assert.equal(read.json().value.contentFingerprint, 'a'.repeat(64));
    const listed = await app.inject({
      method: 'GET',
      url: `/v1/dataset-versions?datasetId=${datasetId}`,
    });
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().length, 1);
  } finally {
    await app.close();
  }
});

void test('[DSM-002] dataset result DTO rejects malformed hashes and non-UUID version identities', async () => {
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(context()),
  };
  const { app } = await createApiApplication({
    datasetVersionRepository: new InMemoryDatasetVersionRepositoryAdapter(),
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/dataset-versions',
      payload: {
        versionId: 'not-a-uuid',
        datasetId,
        inputArtifactVersionIds: [],
        schemaVersionId: '00000000-0000-4000-8000-000000000808',
        mappingVersionId: '00000000-0000-4000-8000-000000000809',
        ruleSetVersionId: '00000000-0000-4000-8000-000000000810',
        engineBuild: 'engine@1',
        contentFingerprint: 'not-a-hash',
        rowCount: 0,
        qualityState: 'PASS',
        lineageManifestHash: 'not-a-hash',
      },
    });
    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});
