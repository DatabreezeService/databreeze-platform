/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method -- test doubles mirror async ports and repository inspection is intentional. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Aes256GcmEmailVerificationEnvelopeAdapter } from '../../../src/features/iam/adapter/email-verification-envelope.adapter.js';
import {
  HmacSha256EmailVerificationDigestAdapter,
  InMemoryEmailVerificationRepositoryAdapter,
} from '../../../src/features/iam/adapter/in-memory-email-verification-repository.adapter.js';
import { EmailVerificationService } from '../../../src/features/iam/application/email-verification.service.js';
import { PasswordCredentialService } from '../../../src/features/iam/application/password-credential.service.js';

const PASSWORD = 'correct horse battery staple';
const HASH = '$argon2id$v=19$m=65536,p=1,t=3$YWJjZGVmZ2hpamtsbW5vcA==$cXdlcnR5dWlvcGFzZGZnaGprbA==';

function fixture(options: { readonly deliveryFails?: boolean } = {}) {
  const repository = new InMemoryEmailVerificationRepositoryAdapter();
  let now = new Date('2026-01-01T00:00:00.000Z');
  let sequence = 10;
  let challengeSequence = 201;
  const delivered: string[] = [];
  const service = new EmailVerificationService({
    repository,
    digest: new HmacSha256EmailVerificationDigestAdapter('test-email-verification-key'),
    envelope: new Aes256GcmEmailVerificationEnvelopeAdapter(Buffer.alloc(32, 5)),
    passwordCredentials: new PasswordCredentialService({
      hash: async () => ({ schemaVersion: 1, algorithm: 'argon2id', encodedHash: HASH }),
      verify: async () => true,
    }),
    delivery: {
      async deliver(input) {
        delivered.push(input.code);
        if (options.deliveryFails) throw new Error('mail unavailable');
      },
    },
    clock: { now: () => new Date(now) },
    codes: { next: () => '123456' },
    ids: { next: () => `00000000-0000-4000-8000-${String(challengeSequence++).padStart(12, '0')}` },
    activationIds: {
      next: () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    },
  });
  return {
    service,
    repository,
    delivered,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

void test('[IAM-022] challenge is opaque, six digits, ten minutes and digest-only', async () => {
  const { service, repository, delivered } = fixture();
  const result = await service.requestEmailVerification({
    email: 'Owner@Example.com',
    password: PASSWORD,
    locale: 'vi-VN',
    clientPlatform: 'web',
  });
  assert.equal(result.accepted, true);
  assert.deepEqual(delivered, ['123456']);
  const persisted = repository.allChallenges()[0];
  assert.ok(persisted);
  assert.equal(Date.parse(persisted.expiresAt) - Date.parse(persisted.issuedAt), 600_000);
  assert.doesNotMatch(JSON.stringify(persisted), /owner@example\.com|correct horse|123456/iu);
});

void test('[IAM-022] five bad attempts lock and expiry rejects', async () => {
  const { service, setNow } = fixture();
  const requested = await service.requestEmailVerification({
    email: 'owner@example.com',
    password: PASSWORD,
  });
  assert.equal(requested.accepted, true);
  if (!requested.accepted) return;
  for (let index = 0; index < 5; index += 1) {
    const result = await service.verifyEmailRegistration({
      challengeId: requested.value.challengeId,
      code: '000000',
      idempotencyKey: `bad-attempt-${index}`,
      clientPlatform: 'web',
    });
    assert.equal(result.accepted, false);
  }
  const locked = await service.verifyEmailRegistration({
    challengeId: requested.value.challengeId,
    code: '123456',
    idempotencyKey: 'after-lock-1',
    clientPlatform: 'web',
  });
  assert.deepEqual(locked, { accepted: false, code: 'LOCKED' });

  const fresh = fixture();
  const expiring = await fresh.service.requestEmailVerification({
    email: 'fresh@example.com',
    password: PASSWORD,
  });
  assert.equal(expiring.accepted, true);
  if (!expiring.accepted) return;
  fresh.setNow('2026-01-01T00:11:00.000Z');
  assert.deepEqual(
    await fresh.service.verifyEmailRegistration({
      challengeId: expiring.value.challengeId,
      code: '123456',
      idempotencyKey: 'expired-key-1',
      clientPlatform: 'web',
    }),
    { accepted: false, code: 'EXPIRED' },
  );
  void setNow;
});

void test('[IAM-022] delivery failure revokes and reports unavailable', async () => {
  const { service, repository } = fixture({ deliveryFails: true });
  assert.deepEqual(
    await service.requestEmailVerification({ email: 'retry@example.com', password: PASSWORD }),
    { accepted: false, code: 'VERIFICATION_UNAVAILABLE' },
  );
  assert.deepEqual(
    repository.allChallenges().map((challenge) => challenge.status),
    ['REVOKED'],
  );
});
