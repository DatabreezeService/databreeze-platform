import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  createPkceChallengeV1,
  isAllowedRedirectUriV1,
  verifyPkceChallengeV1,
} from '../dist/pkce/v1.js';

const hashPort = {
  sha256Base64Url(value) {
    return createHash('sha256').update(value, 'utf8').digest('base64url');
  },
};

void test('[IAM-002] PKCE accepts an RFC 7636 verifier and derives an S256 challenge', async () => {
  const verifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';
  const created = createPkceChallengeV1(verifier, hashPort);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.value.method, 'S256');
  assert.equal(verifyPkceChallengeV1(verifier, created.value.challenge, hashPort), true);
  assert.equal(verifyPkceChallengeV1(`${verifier}x`, created.value.challenge, hashPort), false);
});

void test('[IAM-002] PKCE rejects malformed verifiers and plain challenges', async () => {
  assert.deepEqual(createPkceChallengeV1('short', hashPort), {
    accepted: false,
    code: 'INVALID_VERIFIER',
  });
  assert.equal(verifyPkceChallengeV1('short', 'plain', hashPort), false);
});

void test('[IAM-002] native redirect allowlist requires an exact loopback or app callback', () => {
  assert.equal(isAllowedRedirectUriV1('http://127.0.0.1:43123/callback'), true);
  assert.equal(isAllowedRedirectUriV1('com.databreeze.desktop:/oauth2redirect'), true);
  assert.equal(isAllowedRedirectUriV1('https://evil.example/callback'), false);
  assert.equal(isAllowedRedirectUriV1('http://127.0.0.1:43123/callback?next=https://evil'), false);
});
