import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ProviderContractErrorV1,
  ProviderOperationErrorV1,
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

function isIdempotencyConflict(error) {
  return error instanceof ProviderOperationErrorV1 && error.code === 'CONFLICT' && !error.retryable;
}

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

test('begin rejects reuse of an idempotency key for a different multipart plan', async () => {
  const port = storageFakeV1('begin-conflict-memory-v1', 'map', sha256);
  const firstPlan = defineObjectStorageMultipartPlanV1({
    objectKey: 'workspace/begin-conflict-a',
    expectedSha256: 'a'.repeat(64),
    expectedByteLength: 3,
    partSizeBytes: 8 * 1024 * 1024,
  });
  const secondPlan = defineObjectStorageMultipartPlanV1({
    objectKey: 'workspace/begin-conflict-b',
    expectedSha256: 'b'.repeat(64),
    expectedByteLength: 4,
    partSizeBytes: 16 * 1024 * 1024,
  });
  const firstRequest = {
    context: context('begin-multipart-upload', 'idem-begin-conflict'),
    plan: firstPlan,
  };
  const first = await port.beginMultipartUpload(firstRequest);
  assert.equal(await port.beginMultipartUpload(firstRequest), first);
  await assert.rejects(
    () =>
      port.beginMultipartUpload({
        context: context('begin-multipart-upload', 'idem-begin-conflict'),
        plan: secondPlan,
      }),
    isIdempotencyConflict,
  );
});

test('upload rejects reuse of an idempotency key for another upload or part integrity tuple', async () => {
  const port = storageFakeV1('upload-conflict-memory-v1', 'map', sha256);
  const plan = defineObjectStorageMultipartPlanV1({
    objectKey: 'workspace/upload-conflict',
    expectedSha256: sha256(new Uint8Array([1, 2, 3])),
    expectedByteLength: 3,
    partSizeBytes: 8 * 1024 * 1024,
  });
  const firstUpload = await port.beginMultipartUpload({
    context: context('begin-multipart-upload', 'idem-upload-conflict-begin-a'),
    plan,
  });
  const secondUpload = await port.beginMultipartUpload({
    context: context('begin-multipart-upload', 'idem-upload-conflict-begin-b'),
    plan,
  });
  const firstPart = defineObjectStoragePartV1({
    partNumber: 1,
    content: new Uint8Array([1, 2, 3]),
    sha256: sha256(new Uint8Array([1, 2, 3])),
  });
  const secondPart = defineObjectStoragePartV1({
    partNumber: 1,
    content: new Uint8Array([1, 2, 4]),
    sha256: sha256(new Uint8Array([1, 2, 4])),
  });
  const firstRequest = defineObjectStorageUploadPartRequestV1({
    context: context('upload-part', 'idem-upload-conflict'),
    upload: firstUpload,
    part: firstPart,
  });
  const first = await port.uploadPart(firstRequest);
  assert.equal(await port.uploadPart(firstRequest), first);
  for (const [upload, part] of [
    [secondUpload, firstPart],
    [firstUpload, secondPart],
  ]) {
    await assert.rejects(
      () =>
        port.uploadPart(
          defineObjectStorageUploadPartRequestV1({
            context: context('upload-part', 'idem-upload-conflict'),
            upload,
            part,
          }),
        ),
      isIdempotencyConflict,
    );
  }
});

test('upload binds an idempotency key to the exact immutable part object', async () => {
  const port = storageFakeV1('upload-part-identity-memory-v1', 'map', sha256);
  const content = new Uint8Array([1, 2, 3]);
  const declaredSha256 = sha256(content);
  const plan = defineObjectStorageMultipartPlanV1({
    objectKey: 'workspace/upload-part-identity',
    expectedSha256: declaredSha256,
    expectedByteLength: content.byteLength,
    partSizeBytes: 8 * 1024 * 1024,
  });
  const upload = await port.beginMultipartUpload({
    context: context('begin-multipart-upload', 'idem-upload-part-identity-begin'),
    plan,
  });
  const originalPart = defineObjectStoragePartV1({
    partNumber: 1,
    content,
    sha256: declaredSha256,
  });
  const originalRequest = defineObjectStorageUploadPartRequestV1({
    context: context('upload-part', 'idem-upload-part-identity'),
    upload,
    part: originalPart,
  });
  const receipt = await port.uploadPart(originalRequest);
  assert.equal(await port.uploadPart(originalRequest), receipt);

  for (const replacementPart of [
    defineObjectStoragePartV1({ partNumber: 1, content, sha256: declaredSha256 }),
    defineObjectStoragePartV1({
      partNumber: 1,
      content: new Uint8Array([9, 8, 7]),
      sha256: declaredSha256,
    }),
  ]) {
    await assert.rejects(
      () =>
        port.uploadPart(
          defineObjectStorageUploadPartRequestV1({
            context: context('upload-part', 'idem-upload-part-identity'),
            upload,
            part: replacementPart,
          }),
        ),
      isIdempotencyConflict,
    );
  }
});

test('complete rejects reuse of an idempotency key for another bound upload and receipt list', async () => {
  const port = storageFakeV1('complete-conflict-memory-v1', 'map', sha256);
  const content = new Uint8Array([1, 2, 3]);
  const plan = defineObjectStorageMultipartPlanV1({
    objectKey: 'workspace/complete-conflict',
    expectedSha256: sha256(content),
    expectedByteLength: content.byteLength,
    partSizeBytes: 8 * 1024 * 1024,
  });
  const uploads = await Promise.all(
    ['a', 'b'].map((suffix) =>
      port.beginMultipartUpload({
        context: context('begin-multipart-upload', `idem-complete-conflict-begin-${suffix}`),
        plan,
      }),
    ),
  );
  const part = defineObjectStoragePartV1({ partNumber: 1, content, sha256: sha256(content) });
  const receipts = await Promise.all(
    uploads.map((upload, index) =>
      port.uploadPart(
        defineObjectStorageUploadPartRequestV1({
          context: context('upload-part', `idem-complete-conflict-part-${index}`),
          upload,
          part,
        }),
      ),
    ),
  );
  const requests = uploads.map((upload, index) =>
    defineObjectStorageCompleteMultipartRequestV1({
      context: context('complete-multipart-upload', 'idem-complete-conflict'),
      upload,
      orderedParts: [receipts[index]],
    }),
  );
  const first = await port.completeMultipartUpload(requests[0]);
  assert.equal(await port.completeMultipartUpload(requests[0]), first);
  await assert.rejects(() => port.completeMultipartUpload(requests[1]), isIdempotencyConflict);
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

test('map and record storage fakes both report an absent delete as false', async () => {
  const results = await Promise.all(
    [
      ['map', storageFakeV1('map-delete-memory-v1', 'map', sha256)],
      ['record', storageFakeV1('record-delete-memory-v1', 'record', sha256)],
    ].map(([backing, port]) =>
      port.deleteVerified({
        context: context('delete-verified', `idem-delete-missing-${backing}`),
        objectRef: 'object:missing',
        expectedSha256: 'a'.repeat(64),
      }),
    ),
  );

  assert.deepEqual(results, [{ deleted: false }, { deleted: false }]);
});

test('declares only the canonical contracts dependency and no provider SDK', () => {
  const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dependencies, { '@databreeze/contracts': 'workspace:*' });
  assert.deepEqual(manifest.optionalDependencies ?? {}, {});
});
