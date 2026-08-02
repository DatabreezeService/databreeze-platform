import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryGovernedDatasetRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-governed-dataset-repository.adapter.js';
import { GovernedDatasetService } from '../../../src/features/dsm/application/governed-dataset.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000751';
const workspaceId = '00000000-0000-4000-8000-000000000752';
const datasetId = '00000000-0000-4000-8000-000000000753';
const versionId = '00000000-0000-4000-8000-000000000754';
const publishedVersionId = '00000000-0000-4000-8000-000000000755';

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000756',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000757',
    idempotencyKey: 'dataset-controller',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

void test('[DSM-005, DSM-006, DSM-018, DSM-021] governed dataset HTTP surfaces publish and compare immutable versions', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  const tenantContext = context();
  const service = new GovernedDatasetService(repository);
  const created = await service.create(tenantContext, {
    datasetId,
    versionId,
    tenantScope: tenantContext.tenantScope,
    name: 'Orders',
    fields: [
      {
        fieldId: '00000000-0000-4000-8000-000000000758',
        name: 'amount',
        type: 'DECIMAL',
        nullable: true,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    canonicalHash: 'a'.repeat(64),
  });
  assert.equal(created.accepted, true);
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    governedDatasetRepository: repository,
    requestTenantContext,
  });
  try {
    const published = await app.inject({
      method: 'POST',
      url: `/v1/datasets/${datasetId}/versions/${versionId}/publish`,
      payload: {
        nextVersionId: publishedVersionId,
        publishedAt: '2026-01-01T00:01:00.000Z',
      },
    });
    assert.equal(published.statusCode, 200);
    const publishedBody = JSON.parse(published.body) as {
      readonly value: { readonly status: string };
    };
    assert.equal(publishedBody.value.status, 'PUBLISHED');
    const read = await app.inject({
      method: 'GET',
      url: `/v1/datasets/${datasetId}/versions/${publishedVersionId}`,
    });
    assert.equal(read.statusCode, 200);
    const readBody = JSON.parse(read.body) as { readonly value: { readonly versionId: string } };
    assert.equal(readBody.value.versionId, publishedVersionId);
    const comparison = await app.inject({
      method: 'GET',
      url: `/v1/datasets/${datasetId}/compatibility?previousVersionId=${versionId}&nextVersionId=${publishedVersionId}`,
    });
    assert.equal(comparison.statusCode, 200);
    assert.deepEqual(comparison.json(), { accepted: true, value: 'ADDITIVE_COMPATIBLE' });
  } finally {
    await app.close();
  }
});
