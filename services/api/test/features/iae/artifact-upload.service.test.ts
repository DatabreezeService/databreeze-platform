import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  createArtifactUploadSessionV1,
  expireArtifactUploadSessionV1,
  type ArtifactUploadSessionV1,
} from '@databreeze/domain/artifact-upload/v1';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type {
  ArtifactUploadRepositoryPortV1,
  ArtifactUploadTransactionPortV1,
} from '../../../src/features/iae/application/artifact-upload-repository.port.js';
import { ArtifactUploadService } from '../../../src/features/iae/application/artifact-upload.service.js';
import { InMemoryArtifactUploadRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-upload-repository.adapter.js';
import { InMemoryArtifactUploadStorageAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-upload-storage.adapter.js';

class TrackingStorageAdapter extends InMemoryArtifactUploadStorageAdapter {
  public abortCalls = 0;

  public override async abort(
    ...argumentsList: Parameters<InMemoryArtifactUploadStorageAdapter['abort']>
  ): Promise<void> {
    this.abortCalls += 1;
    await super.abort(...argumentsList);
  }
}

class RevalidatingUploadRepository implements ArtifactUploadRepositoryPortV1 {
  private reads = 0;

  public constructor(
    private readonly open: ArtifactUploadSessionV1,
    private readonly expired: ArtifactUploadSessionV1,
  ) {}

  public async save(): Promise<void> {}

  public find(): Promise<ArtifactUploadSessionV1 | undefined> {
    this.reads += 1;
    return Promise.resolve(this.reads === 1 ? this.open : this.expired);
  }

  public withTransaction<TValue>(
    _context: Parameters<ArtifactUploadRepositoryPortV1['withTransaction']>[0],
    work: (transaction: ArtifactUploadTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return work({
      save: this.save.bind(this),
      find: this.find.bind(this),
    });
  }
}

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
  const service = new ArtifactUploadService(
    new InMemoryArtifactUploadRepositoryAdapter(),
    new InMemoryArtifactUploadStorageAdapter(),
  );
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
  const transfer = await service.issuePartTransfer(context, created.value.sessionId, 1);
  assert.equal(transfer.accepted, true);
  if (!transfer.accepted) return;
  const part = await service.recordPart(context, created.value.sessionId, {
    transferId: transfer.value.transferId,
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

void test('IAE-014 expiration revokes storage-side partial state before persisting terminal status', async () => {
  const storage = new TrackingStorageAdapter();
  const service = new ArtifactUploadService(new InMemoryArtifactUploadRepositoryAdapter(), storage);
  const created = await service.create(context, {
    sessionId: '77777777-7777-4777-8777-777777777777',
    artifactId: '88888888-8888-4888-8888-888888888888',
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
  const expired = await service.expire(
    context,
    created.value.sessionId,
    '2026-08-02T01:00:00.000Z',
  );
  assert.equal(expired.accepted, true);
  if (!expired.accepted) return;
  assert.equal(expired.value.state, 'EXPIRED');
  assert.equal(storage.abortCalls, 1);
  const transfer = await service.issuePartTransfer(context, created.value.sessionId, 1);
  assert.deepEqual(transfer, { accepted: false, code: 'UPLOAD_SESSION_EXPIRED' });
});

void test('IAE-014 transfer issuance revalidates the session before returning a grant', async () => {
  const created = createArtifactUploadSessionV1({
    sessionId: '99999999-9999-4999-8999-999999999991',
    artifactId: '99999999-9999-4999-8999-999999999992',
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
  const expired = expireArtifactUploadSessionV1(created.value, created.value.expiresAt);
  assert.equal(expired.accepted, true);
  if (!expired.accepted) return;

  const service = new ArtifactUploadService(
    new RevalidatingUploadRepository(created.value, expired.value),
    new InMemoryArtifactUploadStorageAdapter(),
  );
  assert.deepEqual(await service.issuePartTransfer(context, created.value.sessionId, 1), {
    accepted: false,
    code: 'UPLOAD_SESSION_EXPIRED',
  });
});
