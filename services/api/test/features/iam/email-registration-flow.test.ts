/* eslint-disable @typescript-eslint/require-await -- cryptography and delivery doubles implement asynchronous ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HmacSha256EmailVerificationDigestAdapter,
  InMemoryEmailVerificationRepositoryAdapter,
} from '../../../src/features/iam/adapter/in-memory-email-verification-repository.adapter.js';
import { Aes256GcmEmailVerificationEnvelopeAdapter } from '../../../src/features/iam/adapter/email-verification-envelope.adapter.js';
import { EmailVerificationService } from '../../../src/features/iam/application/email-verification.service.js';
import { PasswordCredentialService } from '../../../src/features/iam/application/password-credential.service.js';

const challengeId = '00000000-0000-4000-8000-000000000301';

function service() {
  const delivered: Array<{ readonly email: string; readonly code: string }> = [];
  const repository = new InMemoryEmailVerificationRepositoryAdapter();
  let activationSequence = 100;
  const verification = new EmailVerificationService({
    repository,
    digest: new HmacSha256EmailVerificationDigestAdapter('test-email-verification-key'),
    envelope: new Aes256GcmEmailVerificationEnvelopeAdapter(Buffer.alloc(32, 7)),
    passwordCredentials: new PasswordCredentialService({
      hash: async () => ({
        schemaVersion: 1,
        algorithm: 'argon2id',
        encodedHash:
          '$argon2id$v=19$m=65536,p=1,t=3$YWJjZGVmZ2hpamtsbW5vcA==$cXdlcnR5dWlvcGFzZGZnaGprbA==',
      }),
      verify: async () => true,
    }),
    delivery: {
      deliver: async (input) => {
        delivered.push({ email: input.email, code: input.code });
      },
    },
    clock: { now: () => new Date('2026-08-13T00:00:00.000Z') },
    codes: { next: () => '123456' },
    ids: { next: () => challengeId },
    activationIds: {
      next: () => `00000000-0000-4000-8000-${String(activationSequence++).padStart(12, '0')}`,
    },
  });
  return { delivered, repository, verification };
}

void test('[IAM-022] email and password request creates an opaque challenge without a display name', async () => {
  const { delivered, repository, verification } = service();
  const result = await verification.requestEmailVerification({
    email: 'Owner@Example.com',
    password: 'correct horse battery staple',
    locale: 'vi-VN',
    clientPlatform: 'web',
  } as never);

  assert.deepEqual(result, {
    accepted: true,
    value: { requested: true, challengeId },
  });
  assert.deepEqual(delivered, [{ email: 'owner@example.com', code: '123456' }]);
  const persisted = JSON.stringify(repository.allChallenges());
  assert.doesNotMatch(persisted, /Owner@Example\.com|owner@example\.com|correct horse|123456/u);
});

void test('[IAM-022, IAM-023, WEB-004] correct OTP atomically activates a personal owner and Web session', async () => {
  const { verification } = service();
  await verification.requestEmailVerification({
    email: 'owner@example.com',
    password: 'correct horse battery staple',
    locale: 'vi-VN',
    clientPlatform: 'web',
  } as never);

  const result = await verification.verifyEmailRegistration({
    challengeId,
    code: '123456',
    idempotencyKey: 'registration-activation-0001',
    clientPlatform: 'web',
  } as never);

  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.alreadyCompleted, false);
  assert.equal(result.value.principal.organizationId.length, 36);
  assert.equal(result.value.principal.workspaceId.length, 36);
  assert.equal(result.value.session.sessionId.length, 36);
  assert.match(result.value.session.accessToken, /^[A-Za-z0-9._~-]{80,4096}$/u);
  assert.match(result.value.session.refreshToken, /^[A-Za-z0-9._~-]{80,4096}$/u);

  const replay = await verification.verifyEmailRegistration({
    challengeId,
    code: '123456',
    idempotencyKey: 'registration-activation-0001',
    clientPlatform: 'web',
  } as never);
  assert.equal(replay.accepted, true);
  if (!replay.accepted) return;
  assert.equal(replay.value.alreadyCompleted, true);
  assert.equal(replay.value.session.sessionId, result.value.session.sessionId);
  assert.equal(replay.value.session.refreshToken, result.value.session.refreshToken);
});

void test('[IAM-022] missing protected pending-registration support fails closed', async () => {
  const { verification } = service();
  const result = await verification.requestEmailVerification({
    email: 'owner@example.com',
    password: '',
    locale: 'vi-VN',
    clientPlatform: 'web',
  } as never);
  assert.deepEqual(result, { accepted: false, code: 'INVALID_INPUT' });
});
