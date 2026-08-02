import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryReferenceEntityRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-reference-entity-repository.adapter.js';
import { ReferenceEntityService } from '../../../src/features/dsm/application/reference-entity.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000791';
const workspaceId = '00000000-0000-4000-8000-000000000792';
const entityId = '00000000-0000-4000-8000-000000000793';
const versionId = '00000000-0000-4000-8000-000000000794';

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000795',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000796',
    idempotencyKey: 'reference-controller',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

void test('[DSM-025, DSM-026, DSM-027] reference entity API exposes exact versions and resolution history', async () => {
  const repository = new InMemoryReferenceEntityRepositoryAdapter();
  const tenantContext = context();
  const service = new ReferenceEntityService(repository);
  const created = await service.create(tenantContext, {
    entityId,
    versionId,
    tenantScope: tenantContext.tenantScope,
    displayName: 'Công ty Ánh Dương',
    roles: ['SUPPLIER'],
    aliases: ['Anh Duong'],
    externalIdentifiers: [{ namespace: 'tax', value: '0101234567' }],
    canonicalHash: 'a'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    referenceEntityRepository: repository,
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/reference-entities/${entityId}/versions/${versionId}`,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().value.displayName, 'Công ty Ánh Dương');
    const resolutions = await app.inject({
      method: 'GET',
      url: `/v1/reference-entities/${entityId}/resolutions`,
    });
    assert.equal(resolutions.statusCode, 200);
    assert.deepEqual(resolutions.json(), []);
  } finally {
    await app.close();
  }
});
