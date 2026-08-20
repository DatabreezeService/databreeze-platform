import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';

import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { StableIdentifierV1, TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { LocalMinioWorkerObjectByteStoreAdapter } from '../../../src/features/iae/adapter/local-minio-worker-object-byte-store.adapter.js';

const scope = Object.freeze({
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000801' as StableIdentifierV1,
  workspaceId: '00000000-0000-4000-8000-000000000802' as StableIdentifierV1,
}) satisfies TenantScopeV1;
const otherScope = Object.freeze({
  ...scope,
  workspaceId: '00000000-0000-4000-8000-000000000803' as StableIdentifierV1,
}) satisfies TenantScopeV1;
const bytes = new TextEncoder().encode('{"rows":[{"value":125000}]}');
const sha256 = createHash('sha256').update(bytes).digest('hex');

class FakeS3 {
  public readonly sent: (GetObjectCommand | PutObjectCommand)[] = [];
  private readonly objects = new Map<string, Uint8Array>();

  public send(command: GetObjectCommand | PutObjectCommand): Promise<unknown> {
    this.sent.push(command);
    const key = command.input.Key ?? '';
    if (command instanceof PutObjectCommand) {
      if (this.objects.has(key) && command.input.IfNoneMatch === '*')
        return Promise.reject(Object.assign(new Error('exists'), { name: 'PreconditionFailed' }));
      const body = command.input.Body;
      if (!(body instanceof Uint8Array)) return Promise.reject(new Error('unexpected body'));
      this.objects.set(key, new Uint8Array(body));
      return Promise.resolve({});
    }
    const body = this.objects.get(key);
    if (body === undefined)
      return Promise.reject(Object.assign(new Error('missing'), { name: 'NoSuchKey' }));
    return Promise.resolve({
      Body: Readable.from([body]),
      ContentLength: body.byteLength,
      Metadata: { 'content-sha256': createHash('sha256').update(body).digest('hex') },
    });
  }
}

function subject(fake = new FakeS3()) {
  return {
    fake,
    store: new LocalMinioWorkerObjectByteStoreAdapter({
      client: fake as unknown as S3Client,
      bucket: 'databreeze-results',
      keyPrefix: 'local',
    }),
  };
}

void test('[IAE-024, JRA-023] local MinIO keeps result bytes exact and immutable without KMS headers', async () => {
  const { fake, store } = subject();
  const first = await store.writeExact({
    tenantScope: scope,
    objectId: 'result-object-801',
    bytes,
    contentSha256: sha256,
    contentLength: bytes.byteLength,
    maximumByteLength: 1024,
  });
  assert.equal(first.accepted, true);
  const put = fake.sent[0];
  assert.ok(put instanceof PutObjectCommand);
  assert.equal(put.input.IfNoneMatch, '*');
  assert.equal(put.input.ServerSideEncryption, undefined);
  assert.equal(put.input.SSEKMSKeyId, undefined);
  assert.equal(put.input.ChecksumSHA256, Buffer.from(sha256, 'hex').toString('base64'));
  assert.equal(put.input.Key?.includes('result-object-801'), false);

  const replay = await store.writeExact({
    tenantScope: scope,
    objectId: 'result-object-801',
    bytes,
    contentSha256: sha256,
    contentLength: bytes.byteLength,
    maximumByteLength: 1024,
  });
  assert.deepEqual(replay, first);
});

void test('[IAE-002] local MinIO reads only the exact tenant-scoped opaque object', async () => {
  const { store } = subject();
  const written = await store.writeExact({
    tenantScope: scope,
    objectId: 'result-object-802',
    bytes,
    contentSha256: sha256,
    contentLength: bytes.byteLength,
    maximumByteLength: 1024,
  });
  assert.equal(written.accepted, true);
  assert.deepEqual(
    await store.readExact({
      tenantScope: otherScope,
      objectId: 'result-object-802',
      maximumByteLength: 1024,
    }),
    { accepted: false, code: 'OBJECT_NOT_FOUND' },
  );
  const loaded = await store.readExact({
    tenantScope: scope,
    objectId: 'result-object-802',
    maximumByteLength: 1024,
  });
  assert.equal(loaded.accepted, true);
  if (!loaded.accepted) return;
  assert.deepEqual(loaded.value.bytes, bytes);
  assert.equal(loaded.value.contentSha256, sha256);
});

void test('[IAE-024] local MinIO rejects digest and size mismatches before sending bytes', async () => {
  const { fake, store } = subject();
  const results = await Promise.all([
    store.writeExact({
      tenantScope: scope,
      objectId: 'result-object-803',
      bytes,
      contentSha256: '0'.repeat(64),
      contentLength: bytes.byteLength,
      maximumByteLength: 1024,
    }),
    store.writeExact({
      tenantScope: scope,
      objectId: 'result-object-804',
      bytes,
      contentSha256: sha256,
      contentLength: bytes.byteLength + 1,
      maximumByteLength: 1024,
    }),
    store.writeExact({
      tenantScope: scope,
      objectId: 'result-object-805',
      bytes,
      contentSha256: sha256,
      contentLength: bytes.byteLength,
      maximumByteLength: 1,
    }),
  ]);
  assert.deepEqual(results, [
    { accepted: false, code: 'STORE_UNAVAILABLE' },
    { accepted: false, code: 'STORE_UNAVAILABLE' },
    { accepted: false, code: 'OBJECT_OVERSIZE' },
  ]);
  assert.equal(fake.sent.length, 0);
});
