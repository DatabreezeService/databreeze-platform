import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryMappingRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-mapping-repository.adapter.js';
import { MappingService } from '../../../src/features/dsm/application/mapping.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000761';
const workspaceId = '00000000-0000-4000-8000-000000000762';
const datasetId = '00000000-0000-4000-8000-000000000763';
const versionId = '00000000-0000-4000-8000-000000000764';
const nextVersionId = '00000000-0000-4000-8000-000000000765';

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000766',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000767',
    idempotencyKey: 'mapping-controller',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

void test('[DSM-009, DSM-010, DSM-021] mapping publication is exposed as an immutable version transition', async () => {
  const repository = new InMemoryMappingRepositoryAdapter();
  const tenantContext = context();
  const service = new MappingService(repository);
  const created = await service.create(tenantContext, {
    datasetId,
    versionId,
    tenantScope: tenantContext.tenantScope,
    sourceSchemaVersionId: '00000000-0000-4000-8000-000000000768',
    targetSchemaVersionId: '00000000-0000-4000-8000-000000000769',
    steps: [
      {
        sourceFieldId: '00000000-0000-4000-8000-000000000770',
        targetFieldId: '00000000-0000-4000-8000-000000000771',
        transform: 'TRIM',
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
    mappingRepository: repository,
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/datasets/${datasetId}/mappings/${versionId}/publish`,
      payload: { nextVersionId, publishedAt: '2026-01-01T00:01:00.000Z' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().value.status, 'PUBLISHED');
  } finally {
    await app.close();
  }
});
