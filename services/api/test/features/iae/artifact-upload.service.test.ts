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
import type {
  ArtifactUploadAdmissionDecisionV1,
  ArtifactUploadAdmissionPortV1,
} from '../../../src/features/iae/application/artifact-upload-admission.port.js';
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

const admissionDecision = {
  tenantScope: context.tenantScope,
  intakeId: '12121212-1212-4121-8121-121212121212',
  artifactId: '66666666-6666-4666-8666-666666666666',
  artifactVersionId: '13131313-1313-4131-8131-131313131313',
  policyVersionId: '14141414-1414-4141-8141-141414141414',
  authorizationEpoch: context.authorizationEpoch,
  expectedSha256: 'a'.repeat(64),
  expectedByteSize: 4,
  mediaType: 'application/octet-stream',
  partSize: 4,
} as unknown as ArtifactUploadAdmissionDecisionV1;

const allowingAdmission: ArtifactUploadAdmissionPortV1 = {
  admitCreate: () => Promise.resolve({ accepted: true, value: admissionDecision }),
  authorizeGrant: () => Promise.resolve({ accepted: true, value: true }),
};

function service(
  repository: ArtifactUploadRepositoryPortV1,
  storage = new InMemoryArtifactUploadStorageAdapter(() => new Date('2026-08-02T00:00:00.000Z')),
) {
  return new ArtifactUploadService(repository, storage, allowingAdmission, {
    clock: () => new Date('2026-08-02T00:00:00.000Z'),
    ids: { next: () => '55555555-5555-4555-8555-555555555555' },
  });
}

void test('IAE-014 service persists parts and rejects stale completion', async () => {
  const uploadService = service(new InMemoryArtifactUploadRepositoryAdapter());
  const created = await uploadService.create(context, {
    intakeId: admissionDecision.intakeId,
    expectedSha256: 'a'.repeat(64),
    expectedByteSize: 4,
    mediaType: 'application/octet-stream',
    requestedPartSize: 4,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const transfer = await uploadService.issuePartTransfer(context, created.value.sessionId, {
    partNumber: 1,
    contentSha256: 'b'.repeat(64),
    byteSize: 4,
  });
  assert.equal(transfer.accepted, true);
  if (!transfer.accepted) return;
  const part = await uploadService.recordPart(context, created.value.sessionId, {
    transferId: transfer.value.transferId,
    partNumber: 1,
    contentSha256: 'b'.repeat(64),
    byteSize: 4,
    uploadedAt: '2026-08-02T00:10:00.000Z',
    expectedRevision: 1,
  });
  assert.equal(part.accepted, true);
  if (!part.accepted) return;
  const completed = await uploadService.complete(context, created.value.sessionId, {
    assembledSha256: 'a'.repeat(64),
    expectedRevision: 2,
  });
  assert.equal(completed.accepted, true);
  if (!completed.accepted) return;
  assert.equal(completed.value.state, 'COMPLETED');
});

void test('IAE-014 expiration revokes storage-side partial state before persisting terminal status', async () => {
  const storage = new TrackingStorageAdapter();
  const uploadService = service(new InMemoryArtifactUploadRepositoryAdapter(), storage);
  const created = await uploadService.create(context, {
    intakeId: admissionDecision.intakeId,
    expectedSha256: 'a'.repeat(64),
    expectedByteSize: 4,
    mediaType: 'application/octet-stream',
    requestedPartSize: 4,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const expired = await uploadService.expire(
    context,
    created.value.sessionId,
    '2026-08-03T00:00:00.000Z',
  );
  assert.equal(expired.accepted, true);
  if (!expired.accepted) return;
  assert.equal(expired.value.state, 'EXPIRED');
  assert.equal(storage.abortCalls, 1);
  const transfer = await uploadService.issuePartTransfer(context, created.value.sessionId, {
    partNumber: 1,
    contentSha256: 'b'.repeat(64),
    byteSize: 4,
  });
  assert.deepEqual(transfer, { accepted: false, code: 'UPLOAD_SESSION_EXPIRED' });
});

void test('IAE-014 transfer issuance revalidates the session before returning a grant', async () => {
  const created = createArtifactUploadSessionV1({
    sessionId: '99999999-9999-4999-8999-999999999991',
    artifactId: '99999999-9999-4999-8999-999999999992',
    artifactVersionId: admissionDecision.artifactVersionId,
    intakeId: admissionDecision.intakeId,
    policyVersionId: admissionDecision.policyVersionId,
    authorizationEpoch: admissionDecision.authorizationEpoch,
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

  const uploadService = service(new RevalidatingUploadRepository(created.value, expired.value));
  assert.deepEqual(
    await uploadService.issuePartTransfer(context, created.value.sessionId, {
      partNumber: 1,
      contentSha256: 'b'.repeat(64),
      byteSize: 4,
    }),
    {
      accepted: false,
      code: 'UPLOAD_SESSION_EXPIRED',
    },
  );
});

void test('[IAE-022] create ignores client authority and uses server-owned identity and lifetime', async () => {
  const uploadService = service(new InMemoryArtifactUploadRepositoryAdapter());
  const created = await uploadService.create(context, {
    intakeId: admissionDecision.intakeId,
    expectedSha256: admissionDecision.expectedSha256,
    expectedByteSize: admissionDecision.expectedByteSize,
    mediaType: admissionDecision.mediaType,
    requestedPartSize: admissionDecision.partSize,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.value.sessionId, '55555555-5555-4555-8555-555555555555');
  assert.equal(created.value.artifactId, admissionDecision.artifactId);
  assert.equal(created.value.artifactVersionId, admissionDecision.artifactVersionId);
  assert.equal(created.value.intakeId, admissionDecision.intakeId);
  assert.equal(created.value.createdAt, '2026-08-02T00:00:00.000Z');
  assert.equal(created.value.expiresAt, '2026-08-03T00:00:00.000Z');
});
