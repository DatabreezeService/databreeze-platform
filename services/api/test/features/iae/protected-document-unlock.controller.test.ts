import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryProtectedDocumentSecretInputAdapter } from '../../../src/features/iae/adapter/in-memory-protected-document-secret-input.adapter.js';
import { InMemoryProtectedDocumentUnlockRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-protected-document-unlock-repository.adapter.js';
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
  idempotencyKey: 'protected-document-http',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const tenantContext = contextResult.value;

void test('IAE-015 HTTP exposes state and handles but rejects secret fields', async () => {
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    protectedDocumentUnlockRepository: new InMemoryProtectedDocumentUnlockRepositoryAdapter(),
    protectedDocumentSecretInput: new InMemoryProtectedDocumentSecretInputAdapter(
      () => '2026-08-04T00:05:00.000Z',
    ),
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/protected-document-unlocks',
      payload: {
        requestId: '55555555-5555-4555-8555-555555555555',
        artifactVersionId: '66666666-6666-4666-8666-666666666666',
        mode: 'LOCAL_SECRET_INPUT',
        createdAt: '2026-08-04T00:00:00.000Z',
        expiresAt: '2026-08-04T00:20:00.000Z',
        password: 'must-never-enter-api',
      },
    });
    assert.equal(response.statusCode, 400);
    assert.doesNotMatch(response.body, /must-never-enter-api|password/iu);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/protected-document-unlocks',
      payload: {
        requestId: '55555555-5555-4555-8555-555555555555',
        artifactVersionId: '66666666-6666-4666-8666-666666666666',
        mode: 'LOCAL_SECRET_INPUT',
        createdAt: '2026-08-04T00:00:00.000Z',
        expiresAt: '2026-08-04T00:20:00.000Z',
      },
    });
    assert.equal(created.statusCode, 201);
    assert.doesNotMatch(created.body, /password|credential|must-never-enter-api/iu);

    const handle = await app.inject({
      method: 'POST',
      url: '/v1/protected-document-unlocks/55555555-5555-4555-8555-555555555555/handle',
    });
    assert.equal(handle.statusCode, 201);
    assert.doesNotMatch(handle.body, /password|credential|must-never-enter-api/iu);
  } finally {
    await app.close();
  }
});
