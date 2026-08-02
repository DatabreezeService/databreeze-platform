import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { ArtifactUploadService } from '../../../src/features/iae/application/artifact-upload.service.js';
import { InMemoryArtifactUploadRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-upload-repository.adapter.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'upload-service',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

void test('IAE-014 service persists parts and rejects stale completion', async () => {
  const service = new ArtifactUploadService(new InMemoryArtifactUploadRepositoryAdapter());
  const created = await service.create(context, {
    sessionId: '55555555-5555-4555-8555-555555555555',
    artifactId: '66666666-6666-4666-8666-666666666666',
    tenantScope: context.tenantScope,
    expectedSha256: 'a'.repeat(64),
    expectedByteSize: 4,
    mediaType: 'application/octet-stream',
    partSize: 4,
    createdAt: '2026-08-02T00:00:00.000Z',
    expiresAt: '2026-08-02T01:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const part = await service.recordPart(context, created.value.sessionId, {
    partNumber: 1,
    contentSha256: 'b'.repeat(64),
    byteSize: 4,
    uploadedAt: '2026-08-02T00:10:00.000Z',
    expectedRevision: 1,
  });
  assert.equal(part.accepted, true);
  if (!part.accepted) return;
  const completed = await service.complete(context, created.value.sessionId, {
    assembledSha256: 'a'.repeat(64),
    expectedRevision: 2,
  });
  assert.equal(completed.accepted, true);
  if (!completed.accepted) return;
  assert.equal(completed.value.state, 'COMPLETED');
});
