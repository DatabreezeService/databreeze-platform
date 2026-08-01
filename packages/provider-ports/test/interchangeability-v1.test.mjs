import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ProviderContractErrorV1,
  assertProviderInvocationActiveV1,
  createProviderInvocationContextV1,
  defineObjectStorageCompleteMultipartRequestV1,
  defineObjectStorageMultipartPlanV1,
  defineObjectStoragePartV1,
  defineObjectStorageUploadPartRequestV1,
} from '../src/v1.ts';
import { storageFakeV1 } from './fixtures/storage-fake-v1.ts';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const sha256 = (content) => createHash('sha256').update(content).digest('hex');

function context(operation, idempotencyKey) {
  return createProviderInvocationContextV1({
    operation,
    operationId: `op-${idempotencyKey}`,
    correlationId: 'corr-interchangeable',
    deadlineAt: '2026-08-01T10:00:05.000Z',
    timeoutMs: 5_000,
    idempotencyKey,
    abortSignal: { aborted: false },
  });
}

async function storeWithReplay(port) {
  const plan = defineObjectStorageMultipartPlanV1({
    objectKey: 'workspace/object-1',
    expectedSha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    expectedByteLength: 3,
    partSizeBytes: 8 * 1024 * 1024,
  });
  const beginContext = context('begin-multipart-upload', 'idem-begin');
  assertProviderInvocationActiveV1(beginContext, '2026-08-01T10:00:00.000Z');
  const [upload, replayedUpload] = await Promise.all([
    port.beginMultipartUpload({ context: beginContext, plan }),
    port.beginMultipartUpload({ context: beginContext, plan }),
  ]);
  assert.equal(upload, replayedUpload);

  const uploadedPart = await port.uploadPart(
    defineObjectStorageUploadPartRequestV1({
      context: context('upload-part', 'idem-part-1'),
      upload,
      part: defineObjectStoragePartV1({
        partNumber: 1,
        content: new Uint8Array([1, 2, 3]),
        sha256: plan.expectedSha256,
      }),
    }),
  );
  const completeContext = context('complete-multipart-upload', 'idem-complete');
  const request = defineObjectStorageCompleteMultipartRequestV1({
    context: completeContext,
    upload,
    orderedParts: [uploadedPart],
  });
  return Promise.all([
    port.completeMultipartUpload(request),
    port.completeMultipartUpload(request),
  ]);
}

test('the typechecked behavioral fake recomputes the completed object digest', async () => {
  const port = storageFakeV1('digest-check-memory-v1', 'map', sha256);
  const plan = defineObjectStorageMultipartPlanV1({
    objectKey: 'workspace/object-with-wrong-plan-digest',
    expectedSha256: 'a'.repeat(64),
    expectedByteLength: 3,
    partSizeBytes: 8 * 1024 * 1024,
  });
  const upload = await port.beginMultipartUpload({
    context: context('begin-multipart-upload', 'idem-begin-wrong-digest'),
    plan,
  });
  const part = defineObjectStoragePartV1({
    partNumber: 1,
    content: new Uint8Array([1, 2, 3]),
    sha256: sha256(new Uint8Array([1, 2, 3])),
  });
  const receipt = await port.uploadPart(
    defineObjectStorageUploadPartRequestV1({
      context: context('upload-part', 'idem-part-wrong-digest'),
      upload,
      part,
    }),
  );
  const request = defineObjectStorageCompleteMultipartRequestV1({
    context: context('complete-multipart-upload', 'idem-complete-wrong-digest'),
    upload,
    orderedParts: [receipt],
  });
  await assert.rejects(() => port.completeMultipartUpload(request), ProviderContractErrorV1);
});

for (const [name, port] of [
  ['map-backed adapter', storageFakeV1('map-memory-v1', 'map', sha256)],
  ['record-backed adapter', storageFakeV1('record-memory-v1', 'record', sha256)],
]) {
  test(`uses the same resumable object-storage contract with a ${name}`, async () => {
    const [first, replay] = await storeWithReplay(port);
    assert.deepEqual(first, {
      objectRef: 'object:workspace/object-1',
      sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      byteLength: 3,
    });
    assert.equal(first, replay, 'an idempotent replay returns the original receipt');
    assert.equal(port.descriptor().capabilities.length, 10);
    assert.equal((await port.checkHealth()).status, 'healthy');
    assert.equal(
      (await port.exportObjectManifest()).manifestFormat,
      'databreeze-object-storage-exit-v1',
    );
  });
}

test('declares only the canonical contracts dependency and no provider SDK', () => {
  const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dependencies, { '@databreeze/contracts': 'workspace:*' });
  assert.deepEqual(manifest.optionalDependencies ?? {}, {});
});
