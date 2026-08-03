import assert from 'node:assert/strict';
import test from 'node:test';

import { RedisRecoveryAdmissionAdapter } from '../../../src/features/iam/adapter/redis-recovery-admission.adapter.js';

const digest = 'a'.repeat(64);
const issuedAt = '2026-08-03T00:00:00.000Z';

void test('[IAM-015] shared recovery admission uses a namespaced digest key and bounded counter', async () => {
  const calls: Array<{ readonly key: string; readonly ttlMs: number }> = [];
  let count = 0;
  const admission = new RedisRecoveryAdmissionAdapter(
    {
      incrementWindow: async (input) => {
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
        { incrementWindow: async () => 1 },
        { keyPrefix: 'raw email ' },
      ),
    /IAM_RECOVERY_ADMISSION_INVALID/u,
  );
});
