import { strict as assert } from 'node:assert';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryArtifactUploadRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-upload-repository.adapter.js';
import type { ArtifactUploadAdmissionPortV1 } from '../../../src/features/iae/application/artifact-upload-admission.port.js';
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

function stableId(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('fixture identifier invalid');
  return parsed.value;
}

void test('IAE-014 upload HTTP control plane never accepts source bytes or paths', async () => {
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const artifactUploadAdmission: ArtifactUploadAdmissionPortV1 = {
    admitCreate: () =>
      Promise.resolve({
        accepted: true,
        value: {
          tenantScope: tenantContext.tenantScope,
          intakeId: stableId('77777777-7777-4777-8777-777777777777'),
          artifactId: stableId('66666666-6666-4666-8666-666666666666'),
          artifactVersionId: stableId('88888888-8888-4888-8888-888888888888'),
          policyVersionId: stableId('99999999-9999-4999-8999-999999999999'),
          authorizationEpoch: tenantContext.authorizationEpoch,
          expectedSha256: 'a'.repeat(64),
          expectedByteSize: 8 * 1024 * 1024,
          mediaType: 'application/octet-stream',
          partSize: 8 * 1024 * 1024,
        },
      }),
    authorizeGrant: () => Promise.resolve({ accepted: true, value: true }),
  };
  const { app } = await createApiApplication({
    artifactUploadRepository: new InMemoryArtifactUploadRepositoryAdapter(),
    artifactUploadAdmission,
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/artifact-upload-sessions',
      payload: {
        intakeId: '77777777-7777-4777-8777-777777777777',
        expectedSha256: 'a'.repeat(64),
        expectedByteSize: 8 * 1024 * 1024,
        mediaType: 'application/octet-stream',
        requestedPartSize: 8 * 1024 * 1024,
      },
    });
    assert.equal(response.statusCode, 201);
    assert.doesNotMatch(response.body, /sourcePath|localPath|rawBytes|excerpt/iu);
    const createdBody = JSON.parse(response.body) as {
      accepted: boolean;
      value?: { sessionId?: string };
    };
    assert.equal(createdBody.accepted, true);
    assert.match(createdBody.value?.sessionId ?? '', /^[0-9a-f-]{36}$/u);
    const sessionId = createdBody.value?.sessionId;
    assert.ok(sessionId);

    const transfer = await app.inject({
      method: 'POST',
      url: `/v1/artifact-upload-sessions/${sessionId}/parts/transfer`,
      payload: {
        partNumber: 1,
        contentSha256: 'a'.repeat(64),
        byteSize: 8 * 1024 * 1024,
      },
    });
    assert.equal(transfer.statusCode, 201);
    const transferBody = JSON.parse(transfer.body) as {
      accepted: boolean;
      value?: {
        transferId?: string;
        sessionId?: string;
        partNumber?: number;
        method?: string;
        url?: string;
        requiredHeaders?: Record<string, string>;
      };
    };
    assert.equal(transferBody.accepted, true);
    assert.equal(transferBody.value?.sessionId, sessionId);
    assert.equal(transferBody.value?.partNumber, 1);
    assert.match(transferBody.value?.transferId ?? '', /^[0-9a-f-]{36}$/u);
    assert.equal(transferBody.value?.method, 'PUT');
    assert.match(transferBody.value?.url ?? '', /^memory:\/\/artifact-upload\/[0-9a-f-]{36}$/u);
    assert.deepEqual(transferBody.value?.requiredHeaders, {
      'content-length': String(8 * 1024 * 1024),
      'x-amz-checksum-sha256': Buffer.from('a'.repeat(64), 'hex').toString('base64'),
    });
    assert.doesNotMatch(transfer.body, /sourcePath|localPath|rawBytes|excerpt|credential/iu);
  } finally {
    await app.close();
  }
});
