import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertMutatingProviderRequestV1,
  assertProviderInvocationActiveV1,
  createProviderInvocationContextV1,
  defineObjectStorageExitManifestV1,
  defineObjectStorageMultipartPlanV1,
  defineObjectStoragePartV1,
  defineProviderDescriptorV1,
  defineProviderHealthV1,
} from '../src/v1.ts';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function descriptor(adapterKey) {
  return defineProviderDescriptorV1({
    kind: 'object-storage',
    adapterKey,
    capabilities: [
      'begin-multipart-upload',
      'upload-part',
      'complete-multipart-upload',
      'abort-multipart-upload',
      'read-range',
      'verify-digest',
      'apply-retention',
      'delete-verified',
      'create-read-grant',
      'export-object-manifest',
    ].map((operation) => ({
      operation,
      idempotency: 'required',
      cancellation: 'cooperative',
      timeoutMs: 5_000,
      maxAttempts: 3,
    })),
    dataHandling: {
      regions: ['local'],
      contentRetention: 'durable',
      maximumRetentionSeconds: 86_400,
      trainingUse: 'not_applicable',
    },
    resilience: { failover: 'manual', degradedBehavior: 'fail_closed' },
    exit: {
      statePortability: 'full',
      exportFormat: 'databreeze-object-storage-exit-v1',
      credentialRevocation: 'not_applicable',
    },
  });
}

function createBacking(kind) {
  if (kind === 'map') {
    const values = new Map();
    return {
      get: (key) => values.get(key),
      set: (key, value) => values.set(key, value),
      delete: (key) => values.delete(key),
    };
  }
  const values = Object.create(null);
  return {
    get: (key) => values[key],
    set: (key, value) => {
      values[key] = value;
      return value;
    },
    delete: (key) => delete values[key],
  };
}

function storageFake(adapterKey, backingKind) {
  const receipts = createBacking(backingKind);
  const parts = createBacking(backingKind);
  const results = createBacking(backingKind);
  return {
    descriptor: () => descriptor(adapterKey),
    async checkHealth() {
      return defineProviderHealthV1({
        status: 'healthy',
        checkedAt: '2026-08-01T10:00:00.000Z',
        latencyMs: 0,
        safeReasonCodes: [],
      });
    },
    async beginMultipartUpload(request) {
      const key = assertMutatingProviderRequestV1(request.context);
      const prior = receipts.get(key);
      if (prior !== undefined) return prior;
      const value = Object.freeze({
        uploadRef: `upload:${request.plan.objectKey}`,
        acceptedPartSizeBytes: request.plan.partSizeBytes,
        maximumParts: request.plan.maximumParts,
      });
      receipts.set(key, value);
      return value;
    },
    async uploadPart(request) {
      const key = assertMutatingProviderRequestV1(request.context);
      const prior = receipts.get(key);
      if (prior !== undefined) return prior;
      const part = defineObjectStoragePartV1(request.part);
      const value = Object.freeze({
        partNumber: part.partNumber,
        sha256: part.sha256,
        byteLength: part.content.byteLength,
        receiptRef: `part:${part.partNumber}`,
      });
      parts.set(`${request.uploadRef}:${part.partNumber}`, part.content);
      receipts.set(key, value);
      return value;
    },
    async completeMultipartUpload(request) {
      const key = assertMutatingProviderRequestV1(request.context);
      const prior = results.get(key);
      if (prior !== undefined) return prior;
      const byteLength = request.orderedParts.reduce((total, part) => total + part.byteLength, 0);
      assert.equal(byteLength, request.expectedByteLength);
      const value = Object.freeze({
        objectRef: `object:${request.uploadRef.slice('upload:'.length)}`,
        sha256: request.expectedSha256,
        byteLength,
      });
      results.set(key, value);
      return value;
    },
    async abortMultipartUpload(request) {
      assertMutatingProviderRequestV1(request.context);
      return Object.freeze({ aborted: true });
    },
    async readRange(request) {
      return (
        parts
          .get(`upload:${request.objectRef.slice('object:'.length)}:1`)
          ?.slice(request.offset, request.offset + request.length) ?? new Uint8Array()
      );
    },
    async verifyDigest() {
      return Object.freeze({ verified: true });
    },
    async applyRetention(request) {
      assertMutatingProviderRequestV1(request.context);
      return Object.freeze({ applied: true });
    },
    async deleteVerified(request) {
      assertMutatingProviderRequestV1(request.context);
      results.delete(request.objectRef);
      return Object.freeze({ deleted: true });
    },
    async createReadGrant(request) {
      assertMutatingProviderRequestV1(request.context);
      return Object.freeze({
        grantRef: `grant:${request.objectRef}`,
        expiresAt: request.expiresAt,
      });
    },
    async exportObjectManifest() {
      return defineObjectStorageExitManifestV1({
        manifestFormat: 'databreeze-object-storage-exit-v1',
        entries: [],
        complete: true,
      });
    },
  };
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
    expectedSha256: 'a'.repeat(64),
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

  const uploadedPart = await port.uploadPart({
    context: context('upload-part', 'idem-part-1'),
    uploadRef: upload.uploadRef,
    part: defineObjectStoragePartV1({
      partNumber: 1,
      content: new Uint8Array([1, 2, 3]),
      sha256: 'b'.repeat(64),
    }),
  });
  const completeContext = context('complete-multipart-upload', 'idem-complete');
  const request = {
    context: completeContext,
    uploadRef: upload.uploadRef,
    orderedParts: [uploadedPart],
    expectedSha256: plan.expectedSha256,
    expectedByteLength: plan.expectedByteLength,
  };
  return Promise.all([
    port.completeMultipartUpload(request),
    port.completeMultipartUpload(request),
  ]);
}

for (const [name, port] of [
  ['map-backed adapter', storageFake('map-memory-v1', 'map')],
  ['record-backed adapter', storageFake('record-memory-v1', 'record')],
]) {
  test(`uses the same resumable object-storage contract with a ${name}`, async () => {
    const [first, replay] = await storeWithReplay(port);
    assert.deepEqual(first, {
      objectRef: 'object:workspace/object-1',
      sha256: 'a'.repeat(64),
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
