import assert from 'node:assert/strict';
import test from 'node:test';

import { HmacSha256IamRecoveryDigestAdapter } from '../../../src/features/iam/adapter/iam-recovery-crypto.adapter.js';

void test('[IAM-015] recovery HMAC digests are deterministic, keyed, and domain-separated', () => {
  const first = new HmacSha256IamRecoveryDigestAdapter('recovery-key-v1-012345678901234567');
  const second = new HmacSha256IamRecoveryDigestAdapter('recovery-key-v1-012345678901234567');
  const other = new HmacSha256IamRecoveryDigestAdapter('other-key-v1-012345678901234567890');
  const token = 'recovery-token-abcdefghijklmnopqrstuvwxyz-123456';
  assert.equal(first.digestToken(token), second.digestToken(token));
  assert.equal(first.digestEmail('user@example.com').length, 64);
  assert.notEqual(first.digestToken(token), first.digestEmail(token));
  assert.notEqual(first.digestToken(token), other.digestToken(token));
  assert.throws(() => first.digestToken(''), /IAM_RECOVERY_INPUT_INVALID/u);
});

void test('[IAM-015] recovery HMAC rejects keys shorter than 32 bytes', () => {
  assert.throws(
    () => new HmacSha256IamRecoveryDigestAdapter('short-recovery-key'),
    /IAM_RECOVERY_KEY_INVALID/u,
  );
  assert.throws(
    () => new HmacSha256IamRecoveryDigestAdapter(new Uint8Array(31)),
    /IAM_RECOVERY_KEY_INVALID/u,
  );
});
