import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryArtifactUploadRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-upload-repository.adapter.js';
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
  idempotencyKey: 'upload-http',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const tenantContext = contextResult.value;

void test('IAE-014 upload HTTP control plane never accepts source bytes or paths', async () => {
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    artifactUploadRepository: new InMemoryArtifactUploadRepositoryAdapter(),
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/artifact-upload-sessions',
      payload: {
        sessionId: '55555555-5555-4555-8555-555555555555',
        artifactId: '66666666-6666-4666-8666-666666666666',
        expectedSha256: 'a'.repeat(64),
        expectedByteSize: 4,
        mediaType: 'application/octet-stream',
        partSize: 4,
        createdAt: '2026-08-02T00:00:00.000Z',
        expiresAt: '2026-08-02T01:00:00.000Z',
      },
    });
    assert.equal(response.statusCode, 201);
    assert.doesNotMatch(response.body, /sourcePath|localPath|rawBytes|excerpt/iu);

    const transfer = await app.inject({
      method: 'POST',
      url: '/v1/artifact-upload-sessions/55555555-5555-4555-8555-555555555555/parts/transfer',
      payload: { partNumber: 1 },
    });
    assert.equal(transfer.statusCode, 201);
    const transferBody = JSON.parse(transfer.body) as {
      accepted: boolean;
      value?: { transferId?: string; sessionId?: string; partNumber?: number };
    };
    assert.equal(transferBody.accepted, true);
    assert.equal(transferBody.value?.sessionId, '55555555-5555-4555-8555-555555555555');
    assert.equal(transferBody.value?.partNumber, 1);
    assert.match(transferBody.value?.transferId ?? '', /^[0-9a-f-]{36}$/u);
    assert.doesNotMatch(transfer.body, /url|path|bytes|locator/iu);
  } finally {
    await app.close();
  }
});
