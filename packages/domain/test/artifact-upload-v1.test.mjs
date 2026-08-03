import assert from 'node:assert/strict';
import test from 'node:test';

import {
  completeArtifactUploadSessionV1,
  createArtifactUploadSessionV1,
  expireArtifactUploadSessionV1,
  recordArtifactUploadPartV1,
} from '../dist/artifact-upload/v1.js';

const base = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  artifactId: '22222222-2222-4222-8222-222222222222',
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
    completeArtifactUploadSessionV1(first.value, {
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
  const completed = completeArtifactUploadSessionV1(second.value, {
    assembledSha256: base.expectedSha256,
    expectedRevision: 3,
  });
  assert.equal(completed.accepted, true);
  if (!completed.accepted) return;
  assert.equal(completed.value.state, 'COMPLETED');
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
