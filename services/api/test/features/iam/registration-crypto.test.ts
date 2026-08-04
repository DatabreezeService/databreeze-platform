import assert from 'node:assert/strict';
import test from 'node:test';

import { HmacSha256IamRegistrationAdmissionDigestAdapter } from '../../../src/features/iam/adapter/iam-registration-crypto.adapter.js';

void test('[IAM-001] registration admission digests are keyed and support bounded rotation overlap', () => {
  assert.throws(
    () => new HmacSha256IamRegistrationAdmissionDigestAdapter('short'),
    /IAM_REGISTRATION_ADMISSION_KEY_INVALID/u,
  );
  const adapter = new HmacSha256IamRegistrationAdmissionDigestAdapter('r'.repeat(32), [
    'p'.repeat(32),
  ]);
  const candidates = adapter.digestCandidates('email', 'User@example.com');
  assert.equal(candidates.length, 2);
  assert.notEqual(candidates[0], candidates[1]);
  assert.match(candidates[0] ?? '', /^[a-f0-9]{64}$/u);
  assert.equal(
    candidates.some((digest) => digest.includes('user@example.com')),
    false,
  );
  assert.deepEqual(candidates, adapter.digestCandidates('email', 'User@example.com'));
});

void test('[IAM-001] registration admission domains remain distinct', () => {
  const adapter = new HmacSha256IamRegistrationAdmissionDigestAdapter('r'.repeat(32));
  assert.notEqual(
    adapter.digestCandidates('ip', '203.0.113.10')[0],
    adapter.digestCandidates('email', '203.0.113.10')[0],
  );
});
