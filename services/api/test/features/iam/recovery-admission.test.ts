import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryRecoveryAdmissionAdapter } from '../../../src/features/iam/adapter/in-memory-recovery-admission.adapter.js';

const digest = 'a'.repeat(64);

void test('[IAM-015] in-memory recovery admission bounds attempts and expires a window', async () => {
  const admission = new InMemoryRecoveryAdmissionAdapter({ maxAttempts: 2, windowSeconds: 60 });
  assert.equal(await admission.allow(digest, '2026-08-03T00:00:00.000Z'), true);
  assert.equal(await admission.allow(digest, '2026-08-03T00:00:01.000Z'), true);
  assert.equal(await admission.allow(digest, '2026-08-03T00:00:02.000Z'), false);
  assert.equal(await admission.allow(digest, '2026-08-03T00:01:01.000Z'), true);
});

void test('[IAM-015] in-memory recovery admission rejects malformed keys and unsafe configuration', async () => {
  const admission = new InMemoryRecoveryAdmissionAdapter();
  assert.equal(await admission.allow('not-a-digest', '2026-08-03T00:00:00.000Z'), false);
  assert.equal(await admission.allow(digest, 'not-a-timestamp'), false);
  assert.throws(
    () => new InMemoryRecoveryAdmissionAdapter({ maxAttempts: 0 }),
    /IAM_RECOVERY_ADMISSION_INVALID/u,
  );
});
