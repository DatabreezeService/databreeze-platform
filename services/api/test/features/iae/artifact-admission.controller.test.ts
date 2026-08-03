import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { createArtifactVersionV1 } from '@databreeze/domain/artifact/v1';
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
  idempotencyKey: 'admit-http',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const tenantContext = contextResult.value;

void test('IAE-009/010 admission HTTP endpoint persists clean status without source content', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const artifact = createArtifactVersionV1({
    artifactId: '55555555-5555-4555-8555-555555555555',
    versionId: '66666666-6666-4666-8666-666666666666',
    tenantScope: tenantContext.tenantScope,
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'a'.repeat(64),
    byteSize: 4,
    mediaType: 'text/csv',
    displayName: 'orders.csv',
    createdAt: '2026-08-02T00:00:00.000Z',
    status: 'QUARANTINED',
  });
  assert.equal(artifact.accepted, true);
  if (!artifact.accepted) return;
  await repository.saveVersion(tenantContext, artifact.value);
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    artifactRepository: repository,
    requestTenantContext,
  });
  try {
    const fractional = await app.inject({
      method: 'POST',
      url: `/v1/artifact-versions/${artifact.value.versionId}/admit`,
      payload: {
        actualSha256: 'a'.repeat(64),
        actualByteSize: 4.5,
        detectedMediaType: 'text/csv',
        scanState: 'CLEAN',
        maxByteSize: 100,
      },
    });
    assert.equal(fractional.statusCode, 400);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/artifact-versions/${artifact.value.versionId}/admit`,
      payload: {
        actualSha256: 'a'.repeat(64),
        actualByteSize: 4,
        detectedMediaType: 'text/csv',
        scanState: 'CLEAN',
        maxByteSize: 100,
      },
    });
    assert.equal(response.statusCode, 201);
    const body = JSON.parse(response.body) as {
      readonly value: { readonly version: { readonly status: string } };
    };
    assert.equal(body.value.version.status, 'ACTIVE');
    assert.doesNotMatch(response.body, /sourcePath|rawBytes|excerpt/iu);
  } finally {
    await app.close();
  }
});
