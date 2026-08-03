import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createArtifactUploadSessionV1 } from '@databreeze/domain/artifact-upload/v1';
import { parseStrictUtcTimestampV1 } from '@databreeze/domain/tenant-scope/v1';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemoryArtifactUploadStorageAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-upload-storage.adapter.js';

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-000000000781',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000782',
    workspaceId: '00000000-0000-4000-8000-000000000783',
  },
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-000000000784',
  idempotencyKey: 'upload-storage',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const timestamp = parseStrictUtcTimestampV1('2026-01-01T00:10:00.000Z');
if (!timestamp.accepted) throw new Error('fixture timestamp invalid');

void test('[IAE-014] storage adapter binds transfer grants to sessions and hides partial objects', async () => {
  const session = createArtifactUploadSessionV1({
    sessionId: '00000000-0000-4000-8000-000000000785',
    artifactId: '00000000-0000-4000-8000-000000000786',
    tenantScope: context.tenantScope,
    expectedSha256: 'a'.repeat(64),
    expectedByteSize: 4,
    mediaType: 'application/octet-stream',
    partSize: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(session.accepted, true);
  if (!session.accepted) return;
  const storage = new InMemoryArtifactUploadStorageAdapter();
  const grant = await storage.issuePartTransfer(context, session.value, 1);
  assert.equal(grant.accepted, true);
  if (!grant.accepted) return;
  const part = {
    partNumber: 1,
    contentSha256: 'b'.repeat(64),
    byteSize: 4,
    uploadedAt: timestamp.value,
  } as const;
  assert.deepEqual(
    await storage.verifyPart(context, session.value, part, '00000000-0000-4000-8000-000000000787'),
    { accepted: false, code: 'UPLOAD_STORAGE_TRANSFER_INVALID' },
  );
  assert.deepEqual(await storage.verifyPart(context, session.value, part, grant.value.transferId), {
    accepted: true,
    value: undefined,
  });
  assert.deepEqual(await storage.finalize(context, session.value, 'a'.repeat(64)), {
    accepted: false,
    code: 'UPLOAD_STORAGE_NOT_READY',
  });
});
