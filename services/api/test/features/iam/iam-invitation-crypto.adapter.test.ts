import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  HmacSha256IamInvitationDigestAdapter,
  randomIamInvitationIdV1,
  randomIamInvitationTokenV1,
} from '../../../src/features/iam/adapter/iam-invitation-crypto.adapter.js';

void test('[IAM-010] invitation digests are deterministic, keyed, domain-separated, and hex bounded', () => {
  const digest = new HmacSha256IamInvitationDigestAdapter('test-key-v1');
  const token = digest.digestToken('raw-token-abcdefghijklmnopqrstuvwxyz123456');
  const email = digest.digestEmail('invitee@example.com');
  assert.match(token, /^[a-f0-9]{64}$/u);
  assert.match(email, /^[a-f0-9]{64}$/u);
  assert.equal(token, digest.digestToken('raw-token-abcdefghijklmnopqrstuvwxyz123456'));
  assert.notEqual(token, email);
  assert.notEqual(
    token,
    new HmacSha256IamInvitationDigestAdapter('other-key-v1').digestToken(
      'raw-token-abcdefghijklmnopqrstuvwxyz123456',
    ),
  );
});

void test('[IAM-010] invitation crypto adapters reject unusable key material', () => {
  assert.throws(() => new HmacSha256IamInvitationDigestAdapter(''), /IAM_INVITATION_KEY_INVALID/);
  assert.throws(
    () => new HmacSha256IamInvitationDigestAdapter(new Uint8Array()),
    /IAM_INVITATION_KEY_INVALID/,
  );
});

void test('[IAM-010] generated invitation identifiers and tokens are fresh and non-guessable', () => {
  const invitationId = randomIamInvitationIdV1();
  const parsed = parseStableIdentifierV1(invitationId);
  assert.equal(parsed.accepted, true);
  const token = randomIamInvitationTokenV1();
  assert.ok(token.length >= 43);
  // This assertion intentionally checks the full C0/control range.
  // eslint-disable-next-line no-control-regex
  assert.doesNotMatch(token, /[\u0000-\u001f\u007f]/u);
  assert.notEqual(token, randomIamInvitationTokenV1());
});
