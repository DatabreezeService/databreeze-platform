import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertProviderInvocationActiveV1,
  defineProviderDescriptorV1,
  requireProviderIdempotencyV1,
} from '../src/v1.ts';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function descriptor(adapterKey) {
  return defineProviderDescriptorV1({
    kind: 'object-storage',
    adapterKey,
    capabilities: [
      {
        operation: 'put-immutable',
        idempotency: 'required',
        cancellation: 'cooperative',
        timeoutMs: 5_000,
        maxAttempts: 3,
      },
    ],
    dataHandling: {
      regions: ['local'],
      contentRetention: 'durable',
      maximumRetentionSeconds: 86_400,
      trainingUse: 'not_applicable',
    },
    resilience: { failover: 'manual', degradedBehavior: 'fail_closed' },
    exit: {
      statePortability: 'full',
      exportFormat: 'databreeze-object-manifest-v1',
      credentialRevocation: 'supported',
    },
  });
}

function mapStorageFake() {
  const byIdempotencyKey = new Map();
  return {
    descriptor: () => descriptor('map-memory-v1'),
    async putImmutable(request) {
      const prior = byIdempotencyKey.get(request.context.idempotencyKey);
      if (prior !== undefined) return prior;
      const result = Object.freeze({
        objectRef: `object:${request.objectKey}`,
        sha256: request.sha256,
        byteLength: request.content.byteLength,
      });
      byIdempotencyKey.set(request.context.idempotencyKey, result);
      return result;
    },
  };
}

function recordStorageFake() {
  const byIdempotencyKey = Object.create(null);
  return {
    descriptor: () => descriptor('record-memory-v1'),
    async putImmutable(request) {
      const key = request.context.idempotencyKey;
      byIdempotencyKey[key] ??= Object.freeze({
        objectRef: `object:${request.objectKey}`,
        sha256: request.sha256,
        byteLength: request.content.byteLength,
      });
      return byIdempotencyKey[key];
    },
  };
}

async function storeTwice(port, context) {
  assertProviderInvocationActiveV1(context, '2026-08-01T10:00:00.000Z');
  requireProviderIdempotencyV1(context);
  const request = {
    context,
    objectKey: 'workspace/object-1',
    content: new Uint8Array([1, 2, 3]),
    sha256: 'a'.repeat(64),
  };
  return Promise.all([port.putImmutable(request), port.putImmutable(request)]);
}

for (const [name, createFake] of [
  ['map-backed adapter', mapStorageFake],
  ['record-backed adapter', recordStorageFake],
]) {
  test(`uses the same object-storage contract with a ${name}`, async () => {
    const context = {
      operationId: 'op-interchangeable',
      correlationId: 'corr-interchangeable',
      deadlineAt: '2026-08-01T10:00:05.000Z',
      timeoutMs: 5_000,
      idempotencyKey: 'idem-interchangeable',
      abortSignal: { aborted: false },
    };
    const [first, replay] = await storeTwice(createFake(), context);

    assert.deepEqual(first, {
      objectRef: 'object:workspace/object-1',
      sha256: 'a'.repeat(64),
      byteLength: 3,
    });
    assert.equal(first, replay, 'an idempotent replay returns the original receipt');
  });
}

test('declares no provider SDK or service implementation dependency', () => {
  const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));

  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.deepEqual(manifest.optionalDependencies ?? {}, {});
});
