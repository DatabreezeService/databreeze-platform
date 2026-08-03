import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REDIS_RECOVERY_ADMISSION_INCREMENT_SCRIPT_V1,
  RedisEvalRecoveryAdmissionCounterAdapter,
  RedisRecoveryAdmissionAdapter,
} from '../../../src/features/iam/adapter/redis-recovery-admission.adapter.js';

const digest = 'a'.repeat(64);
const issuedAt = '2026-08-03T00:00:00.000Z';

void test('[IAM-015] shared recovery admission uses a namespaced digest key and bounded counter', async () => {
  const calls: Array<{ readonly key: string; readonly ttlMs: number }> = [];
  let count = 0;
  const admission = new RedisRecoveryAdmissionAdapter(
    {
      incrementWindow: async (input) => {
        await Promise.resolve();
        calls.push(input);
        count += 1;
        return count;
      },
    },
    { maxAttempts: 2, windowSeconds: 60 },
  );

  assert.equal(await admission.allow(digest, issuedAt), true);
  assert.equal(await admission.allow(digest, issuedAt), true);
  assert.equal(await admission.allow(digest, issuedAt), false);
  assert.deepEqual(calls, [
    { key: `databreeze:iam:recovery:admission:v1:${digest}`, ttlMs: 60_000 },
    { key: `databreeze:iam:recovery:admission:v1:${digest}`, ttlMs: 60_000 },
    { key: `databreeze:iam:recovery:admission:v1:${digest}`, ttlMs: 60_000 },
  ]);
});

void test('[IAM-015] shared recovery admission fails closed for malformed input and counter outages', async () => {
  let calls = 0;
  const admission = new RedisRecoveryAdmissionAdapter({
    incrementWindow: async () => {
      await Promise.resolve();
      calls += 1;
      throw new Error('redis unavailable');
    },
  });

  assert.equal(await admission.allow('not-a-digest', issuedAt), false);
  assert.equal(await admission.allow(digest, 'not-a-timestamp'), false);
  assert.equal(await admission.allow(digest, issuedAt), false);
  assert.equal(calls, 1);
});

void test('[IAM-015] shared recovery admission rejects unsafe configuration', () => {
  assert.throws(
    () =>
      new RedisRecoveryAdmissionAdapter(
        {
          incrementWindow: async () => {
            await Promise.resolve();
            return 1;
          },
        },
        { keyPrefix: 'raw email ' },
      ),
    /IAM_RECOVERY_ADMISSION_INVALID/u,
  );
});

void test('[IAM-015] Redis counter wrapper uses one atomic script and validates returned counts', async () => {
  const calls: Array<{
    readonly script: string;
    readonly keys: readonly string[];
    readonly args: readonly string[];
  }> = [];
  const counter = new RedisEvalRecoveryAdmissionCounterAdapter({
    eval: async (script, keys, args) => {
      await Promise.resolve();
      calls.push({ script, keys, args });
      return '4';
    },
  });

  assert.equal(await counter.incrementWindow({ key: 'databreeze:key', ttlMs: 15_000 }), 4);
  assert.deepEqual(calls, [
    {
      script: REDIS_RECOVERY_ADMISSION_INCREMENT_SCRIPT_V1,
      keys: ['databreeze:key'],
      args: ['15000'],
    },
  ]);
});

void test('[IAM-015] Redis counter wrapper rejects invalid TTLs and malformed replies', async () => {
  const counter = new RedisEvalRecoveryAdmissionCounterAdapter({
    eval: async () => {
      await Promise.resolve();
      return 'not-a-count';
    },
  });
  await assert.rejects(
    counter.incrementWindow({ key: 'databreeze:key', ttlMs: 999 }),
    /IAM_RECOVERY_ADMISSION_COUNTER_INVALID/u,
  );
  await assert.rejects(
    counter.incrementWindow({ key: 'databreeze:key', ttlMs: 15_000 }),
    /IAM_RECOVERY_ADMISSION_COUNTER_INVALID/u,
  );
});
