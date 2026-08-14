import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginArtifactUploadFinalizationV1,
  completeArtifactUploadFinalizationV1,
  createArtifactUploadSessionV1,
  expireArtifactUploadSessionV1,
  recordArtifactUploadPartV1,
} from '../dist/artifact-upload/v1.js';

const base = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  artifactId: '22222222-2222-4222-8222-222222222222',
  artifactVersionId: '55555555-5555-4555-8555-555555555555',
  intakeId: '66666666-6666-4666-8666-666666666666',
  policyVersionId: '77777777-7777-4777-8777-777777777777',
  authorizationEpoch: 3,
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '33333333-3333-4333-8333-333333333333',
    workspaceId: '44444444-4444-4444-8444-444444444444',
  },
  expectedSha256: 'a'.repeat(64),
  expectedByteSize: 8,
  mediaType: 'application/octet-stream',
  partSize: 4,
  createdAt: '2026-08-02T00:00:00.000Z',
  expiresAt: '2026-08-02T01:00:00.000Z',
};

void test('[IAE-014] upload sessions require every bounded part before completion', () => {
  const created = createArtifactUploadSessionV1(base);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const first = recordArtifactUploadPartV1(created.value, {
    partNumber: 1,
    contentSha256: 'b'.repeat(64),
    byteSize: 4,
    uploadedAt: '2026-08-02T00:10:00.000Z',
    expectedRevision: 1,
  });
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.deepEqual(
    beginArtifactUploadFinalizationV1(first.value, {
      assembledSha256: base.expectedSha256,
      expectedRevision: 2,
    }),
    { accepted: false, code: 'MISSING_PARTS' },
  );
  const second = recordArtifactUploadPartV1(first.value, {
    partNumber: 2,
    contentSha256: 'c'.repeat(64),
    byteSize: 4,
    uploadedAt: '2026-08-02T00:11:00.000Z',
    expectedRevision: 2,
  });
  assert.equal(second.accepted, true);
  if (!second.accepted) return;
  const finalizing = beginArtifactUploadFinalizationV1(second.value, {
    assembledSha256: base.expectedSha256,
    expectedRevision: 3,
  });
  assert.equal(finalizing.accepted, true);
  if (!finalizing.accepted) return;
  assert.equal(finalizing.value.state, 'FINALIZING');
  const completed = completeArtifactUploadFinalizationV1(finalizing.value, {
    opaqueLocator: 'opaque_verified_locator_1234',
    objectVersionId: 'exact-object-version-1',
    expectedRevision: 4,
  });
  assert.equal(completed.accepted, true);
  if (!completed.accepted) return;
  assert.equal(completed.value.state, 'COMPLETED');
  assert.equal(completed.value.verifiedObject?.objectVersionId, 'exact-object-version-1');
});

void test('[IAE-014] upload sessions reject a premature expiration timestamp', () => {
  const created = createArtifactUploadSessionV1(base);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  assert.deepEqual(expireArtifactUploadSessionV1(created.value, base.createdAt), {
    accepted: false,
    code: 'INVALID_TIMESTAMP',
  });
});
