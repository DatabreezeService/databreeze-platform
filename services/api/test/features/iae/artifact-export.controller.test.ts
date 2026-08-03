import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryArtifactExportRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-export-repository.adapter.js';
import { InMemoryArtifactLineageRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-lineage-repository.adapter.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
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
  idempotencyKey: 'artifact-export-http',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

void test('IAE-018 export HTTP maps rejected service outcomes to problem responses', async () => {
  const { app } = await createApiApplication({
    artifactExportRepository: new InMemoryArtifactExportRepositoryAdapter(),
    artifactLineageRepository: new InMemoryArtifactLineageRepositoryAdapter(),
    artifactRepository: new InMemoryArtifactRepositoryAdapter(),
    requestTenantContext: { resolve: () => Promise.resolve(context) },
  });
  try {
    const invalid = await app.inject({ method: 'GET', url: '/v1/artifacts/exports/not-a-uuid' });
    assert.equal(invalid.statusCode, 400);
    assert.match(String(invalid.headers['content-type']), /^application\/problem\+json/u);
    assert.equal((invalid.json() as { code: string }).code, 'INVALID_IDENTIFIER');

    const missing = await app.inject({
      method: 'GET',
      url: '/v1/artifacts/exports/55555555-5555-4555-8555-555555555555',
    });
    assert.equal(missing.statusCode, 404);
    assert.equal((missing.json() as { code: string }).code, 'ARTIFACT_NOT_FOUND');

    const missingSource = await app.inject({
      method: 'POST',
      url: '/v1/artifacts/exports',
      payload: {
        manifestId: '66666666-6666-4666-8666-666666666666',
        versionIds: ['77777777-7777-4777-8777-777777777777'],
        approvalState: 'PENDING',
        createdAt: '2026-08-04T00:00:00.000Z',
      },
    });
    assert.equal(missingSource.statusCode, 404);
    assert.equal((missingSource.json() as { code: string }).code, 'ARTIFACT_NOT_FOUND');
  } finally {
    await app.close();
  }
});
