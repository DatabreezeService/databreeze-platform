import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  beginArtifactUploadFinalizationV1,
  createArtifactUploadSessionV1,
} from '@databreeze/domain/artifact-upload/v1';
import { parseStrictUtcTimestampV1 } from '@databreeze/domain/tenant-scope/v1';

import { S3ArtifactUploadStorageAdapter } from '../../../src/features/iae/adapter/s3-artifact-upload-storage.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const NOW = new Date('2026-08-13T03:00:00.000Z');
const MINIMUM_PART_SIZE = 8 * 1024 * 1024;
const CONTENT = Buffer.alloc(MINIMUM_PART_SIZE, 0x44);
const CONTENT_SHA256 = '53e001215b79141de170e46d7417833adefc2b2e3f296b1550c8cf774705203b';

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-000000000901',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000902',
    workspaceId: '00000000-0000-4000-8000-000000000903',
  },
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-000000000904',
  idempotencyKey: 's3-upload-storage-test',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const sessionResult = createArtifactUploadSessionV1({
  sessionId: '00000000-0000-4000-8000-000000000905',
  artifactId: '00000000-0000-4000-8000-000000000906',
  artifactVersionId: '00000000-0000-4000-8000-000000000908',
  intakeId: '00000000-0000-4000-8000-000000000909',
  policyVersionId: '00000000-0000-4000-8000-000000000910',
  authorizationEpoch: context.authorizationEpoch,
  tenantScope: context.tenantScope,
  expectedSha256: CONTENT_SHA256,
  expectedByteSize: CONTENT.length,
  mediaType: 'application/octet-stream',
  partSize: CONTENT.length,
  createdAt: '2026-08-13T02:59:00.000Z',
  expiresAt: '2026-08-13T04:00:00.000Z',
});
if (!sessionResult.accepted) throw new Error('fixture session invalid');
const session = sessionResult.value;

type SentCommand =
  | AbortMultipartUploadCommand
  | CompleteMultipartUploadCommand
  | CopyObjectCommand
  | CreateMultipartUploadCommand
  | DeleteObjectCommand
  | GetObjectCommand
  | HeadObjectCommand
  | ListPartsCommand
  | PutObjectCommand;

class FakeS3 {
  public readonly sent: SentCommand[] = [];
  private readonly controls = new Map<string, string>();
  public uploaded = false;
  public completed = false;
  public published = false;
  public paginateParts = false;

  public send(command: SentCommand): Promise<unknown> {
    this.sent.push(command);
    if (command instanceof GetObjectCommand) {
      if (
        (command.input.Key?.includes('/quarantine/') && this.completed) ||
        (command.input.Key?.includes('/objects/') && this.published)
      ) {
        return Promise.resolve({ Body: Readable.from([CONTENT]) });
      }
      const value = this.controls.get(command.input.Key ?? '');
      if (value === undefined)
        return Promise.reject(Object.assign(new Error('missing'), { name: 'NoSuchKey' }));
      return Promise.resolve({ Body: { transformToString: () => Promise.resolve(value) } });
    }
    if (command instanceof PutObjectCommand) {
      const key = command.input.Key ?? '';
      if (command.input.IfNoneMatch === '*' && this.controls.has(key)) {
        return Promise.reject(Object.assign(new Error('exists'), { name: 'PreconditionFailed' }));
      }
      if (typeof command.input.Body !== 'string') return Promise.reject(new Error('body invalid'));
      this.controls.set(key, command.input.Body);
      return Promise.resolve({ ETag: '"control-etag"' });
    }
    if (command instanceof CreateMultipartUploadCommand) {
      return Promise.resolve({ UploadId: 'durable-upload-id' });
    }
    if (command instanceof ListPartsCommand) {
      if (this.paginateParts && command.input.PartNumberMarker === undefined) {
        return Promise.resolve({
          IsTruncated: true,
          NextPartNumberMarker: 0,
          Parts: [],
        });
      }
      return Promise.resolve({
        IsTruncated: false,
        Parts: this.uploaded
          ? [
              {
                PartNumber: 1,
                Size: CONTENT.length,
                ChecksumSHA256: Buffer.from(CONTENT_SHA256, 'hex').toString('base64'),
                ETag: '"uploaded-part-etag"',
              },
            ]
          : [],
      });
    }
    if (command instanceof CompleteMultipartUploadCommand) {
      this.completed = true;
      return Promise.resolve({ ETag: '"completed-etag"', VersionId: 'quarantine-version-1' });
    }
    if (command instanceof CopyObjectCommand) {
      this.published = true;
      return Promise.resolve({
        CopyObjectResult: { ETag: '"published-etag"' },
        VersionId: 'exact-version-1',
      });
    }
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key?.includes('/objects/') && !this.published)
        return Promise.reject(Object.assign(new Error('missing'), { name: 'NotFound' }));
      if (command.input.Key?.includes('/quarantine/') && !this.completed)
        return Promise.reject(Object.assign(new Error('missing'), { name: 'NotFound' }));
      return Promise.resolve({
        ContentLength: CONTENT.length,
        VersionId: command.input.Key?.includes('/quarantine/')
          ? 'quarantine-version-1'
          : 'exact-version-1',
        Metadata: {
          'databreeze-session-id': session.sessionId,
          'databreeze-sha256': CONTENT_SHA256,
        },
      });
    }
    return Promise.resolve({});
  }
}

void test('[IAE-002][IAE-014][IAE-023] paginates parts, promotes quarantine, and idempotently recovers the exact published version', async () => {
  const fake = new FakeS3();
  fake.paginateParts = true;
  let presignedCommand: UploadPartCommand | undefined;
  let presignedSeconds: number | undefined;
  const storage = new S3ArtifactUploadStorageAdapter({
    client: fake as unknown as S3Client,
    bucket: 'databreeze-production-artifacts',
    kmsKeyId: 'arn:aws:kms:ap-southeast-1:123456789012:key/key-id',
    keyPrefix: 'iae-v1',
    clock: () => NOW,
    ids: { next: () => '00000000-0000-4000-8000-000000000907' },
    presign: (_client, command, options) => {
      presignedCommand = command;
      presignedSeconds = options.expiresIn;
      return Promise.resolve('https://signed.example/exact-part');
    },
  });

  const transfer = await storage.issuePartTransfer(context, session, {
    partNumber: 1,
    contentSha256: CONTENT_SHA256,
    byteSize: CONTENT.length,
  });
  assert.equal(transfer.accepted, true);
  if (!transfer.accepted) return;
  assert.equal(transfer.value.url, 'https://signed.example/exact-part');
  assert.equal(transfer.value.method, 'PUT');
  assert.deepEqual(transfer.value.requiredHeaders, {
    'content-length': String(CONTENT.length),
    'x-amz-checksum-sha256': Buffer.from(CONTENT_SHA256, 'hex').toString('base64'),
  });
  assert.equal(presignedSeconds, 300);
  assert.equal(presignedCommand?.input.PartNumber, 1);
  assert.equal(presignedCommand?.input.ContentLength, CONTENT.length);
  assert.equal(
    presignedCommand?.input.ChecksumSHA256,
    Buffer.from(CONTENT_SHA256, 'hex').toString('base64'),
  );

  fake.uploaded = true;
  const uploadedAt = parseStrictUtcTimestampV1('2026-08-13T03:01:00.000Z');
  if (!uploadedAt.accepted) throw new Error('uploaded timestamp invalid');
  const part = {
    partNumber: 1,
    contentSha256: CONTENT_SHA256,
    byteSize: CONTENT.length,
    uploadedAt: uploadedAt.value,
  } as const;
  assert.deepEqual(await storage.verifyPart(context, session, part, transfer.value.transferId), {
    accepted: true,
    value: undefined,
  });
  const recordedSession = { ...session, parts: [part], revision: 2 };
  const finalizing = beginArtifactUploadFinalizationV1(recordedSession, {
    assembledSha256: CONTENT_SHA256,
    expectedRevision: 2,
  });
  assert.equal(finalizing.accepted, true);
  if (!finalizing.accepted) return;
  const finalized = await storage.finalize(context, finalizing.value, CONTENT_SHA256);
  assert.equal(finalized.accepted, true);
  if (!finalized.accepted) return;
  assert.deepEqual(finalized.value, {
    opaqueLocator: finalized.value.opaqueLocator,
    objectVersionId: 'exact-version-1',
  });
  const recovered = await storage.finalize(context, finalizing.value, CONTENT_SHA256);
  assert.deepEqual(recovered, finalized);
  assert.equal(
    fake.sent.filter((command) => command instanceof CompleteMultipartUploadCommand).length,
    1,
  );
  assert.ok(fake.sent.some((command) => command instanceof CopyObjectCommand));
  assert.ok(
    fake.sent.some(
      (command) =>
        command instanceof GetObjectCommand &&
        command.input.Key?.includes('/objects/') &&
        command.input.VersionId === 'exact-version-1',
    ),
  );
  assert.ok(
    fake.sent.some(
      (command) =>
        command instanceof DeleteObjectCommand &&
        command.input.Key?.includes('/quarantine/') &&
        command.input.VersionId === 'quarantine-version-1',
    ),
  );
});

void test('[IAE-014] rejects unsafe part geometry and objects above 20 GiB before S3 admission', async () => {
  const fake = new FakeS3();
  const storage = new S3ArtifactUploadStorageAdapter({
    client: fake as unknown as S3Client,
    bucket: 'databreeze-production-artifacts',
    kmsKeyId: 'arn:aws:kms:ap-southeast-1:123456789012:key/key-id',
    clock: () => NOW,
  });
  const unsafePart = createArtifactUploadSessionV1({
    ...session,
    sessionId: '00000000-0000-4000-8000-000000000911',
    expectedByteSize: 4,
    partSize: 4,
  });
  assert.equal(unsafePart.accepted, true);
  if (!unsafePart.accepted) return;
  assert.deepEqual(
    await storage.issuePartTransfer(context, unsafePart.value, {
      partNumber: 1,
      contentSha256: CONTENT_SHA256,
      byteSize: 4,
    }),
    { accepted: false, code: 'UPLOAD_STORAGE_NOT_READY' },
  );
  const oversized = createArtifactUploadSessionV1({
    ...session,
    sessionId: '00000000-0000-4000-8000-000000000912',
    expectedByteSize: 20 * 1024 * 1024 * 1024 + 1,
    partSize: 64 * 1024 * 1024,
  });
  assert.equal(oversized.accepted, true);
  if (!oversized.accepted) return;
  assert.deepEqual(
    await storage.issuePartTransfer(context, oversized.value, {
      partNumber: 1,
      contentSha256: CONTENT_SHA256,
      byteSize: 64 * 1024 * 1024,
    }),
    { accepted: false, code: 'UPLOAD_STORAGE_NOT_READY' },
  );
  assert.equal(fake.sent.length, 0);
});

void test('[IAE-008][IAE-014] rejects a cross-tenant transfer before any S3 call', async () => {
  const fake = new FakeS3();
  const otherContextResult = createIamTenantContextV1({
    ...context,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: context.tenantScope.organizationId,
      workspaceId: '00000000-0000-4000-8000-000000000999',
    },
  });
  if (!otherContextResult.accepted) throw new Error('other context invalid');
  const storage = new S3ArtifactUploadStorageAdapter({
    client: fake as unknown as S3Client,
    bucket: 'databreeze-production-artifacts',
    kmsKeyId: 'arn:aws:kms:ap-southeast-1:123456789012:key/key-id',
  });
  assert.deepEqual(
    await storage.issuePartTransfer(otherContextResult.value, session, {
      partNumber: 1,
      contentSha256: CONTENT_SHA256,
      byteSize: CONTENT.length,
    }),
    { accepted: false, code: 'UPLOAD_STORAGE_SCOPE_DENIED' },
  );
  assert.equal(fake.sent.length, 0);
});
