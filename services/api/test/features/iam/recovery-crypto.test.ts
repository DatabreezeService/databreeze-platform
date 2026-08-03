import assert from 'node:assert/strict';
import test from 'node:test';

import { HmacSha256IamRecoveryDigestAdapter } from '../../../src/features/iam/adapter/iam-recovery-crypto.adapter.js';

void test('[IAM-015] recovery HMAC digests are deterministic, keyed, and domain-separated', () => {
  const first = new HmacSha256IamRecoveryDigestAdapter('recovery-key');
  const second = new HmacSha256IamRecoveryDigestAdapter('recovery-key');
  const other = new HmacSha256IamRecoveryDigestAdapter('other-key');
  const token = 'recovery-token-abcdefghijklmnopqrstuvwxyz-123456';
  assert.equal(first.digestToken(token), second.digestToken(token));
  assert.equal(first.digestEmail('user@example.com').length, 64);
  assert.notEqual(first.digestToken(token), first.digestEmail(token));
  assert.notEqual(first.digestToken(token), other.digestToken(token));
  assert.throws(() => first.digestToken(''), /IAM_RECOVERY_INPUT_INVALID/u);
});
