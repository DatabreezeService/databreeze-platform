import assert from 'node:assert/strict';
import test from 'node:test';

import { createHash } from 'node:crypto';

import { RandomServiceAccountSecretIssuer } from '../../../src/features/iam/adapter/random-service-account-secret.adapter.js';

void test('[IAM-013] random service-account secrets are high-entropy and digestable without retaining raw bytes', () => {
  const issuer = new RandomServiceAccountSecretIssuer(() => Buffer.alloc(32, 7));
  const issued = issuer.issue();
  assert.match(issued.secret, /^dbsa_[A-Za-z0-9_-]{43}$/u);
  assert.equal(issued.digest, createHash('sha256').update(issued.secret, 'utf8').digest('hex'));
  assert.equal(issued.digest.length, 64);
});

void test('[IAM-013] malformed random sources fail closed instead of issuing a short credential', () => {
  const issuer = new RandomServiceAccountSecretIssuer(() => Buffer.alloc(8, 1));
  assert.throws(() => issuer.issue(), /SECRET_GENERATION_FAILED/);
});
