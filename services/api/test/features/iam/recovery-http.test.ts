import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { HmacSha256IamRecoveryDigestAdapter } from '../../../src/features/iam/adapter/iam-recovery-crypto.adapter.js';
import { InMemoryRecoveryRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-recovery-repository.adapter.js';
import { PasswordCredentialService } from '../../../src/features/iam/application/password-credential.service.js';

const userId = '00000000-0000-4000-8000-000000000001';
const challengeId = '00000000-0000-4000-8000-000000000002';
const rawToken = 'recovery-token-abcdefghijklmnopqrstuvwxyz-1234567890';

function credentials() {
  return new PasswordCredentialService({
    hash: async () => {
      await Promise.resolve();
      return {
        schemaVersion: 1,
        algorithm: 'argon2id',
        encodedHash: '$argon2id$v=19$m=1,p=1,t=1$YWJjZA==$ZWZmZw==',
      };
    },
    verify: async () => {
      await Promise.resolve();
      return true;
    },
  });
}

void test('[IAM-015] recovery HTTP keeps known and unknown requests generic and consumes a link once', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({ email: 'user@example.com', userId, activeSessionFamilies: ['family-1'] });
  const delivered: Array<{ readonly rawToken: string }> = [];
  const { app } = await createApiApplication({
    recoveryRepository: repository,
    passwordCredentials: credentials(),
    recoveryDigest: new HmacSha256IamRecoveryDigestAdapter('test-recovery-key'),
    recoveryDelivery: {
      deliver: async ({ rawToken: deliveredToken }) => {
        await Promise.resolve();
        delivered.push({ rawToken: deliveredToken });
      },
    },
    recoveryIdGenerator: { next: () => challengeId },
    recoveryTokenGenerator: { next: () => rawToken },
    recoveryClock: { now: () => new Date('2026-08-03T00:00:00.000Z') },
  });
  try {
    const known = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery',
      payload: { email: 'User@example.com' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery',
      payload: { email: 'missing@example.com' },
    });
    assert.equal(known.statusCode, 202);
    assert.deepEqual(known.json(), { requested: true });
    assert.equal(unknown.statusCode, 202);
    assert.deepEqual(unknown.json(), { requested: true });
    assert.equal(delivered.length, 1);

    const completed = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery/complete',
      payload: { token: rawToken, newPassword: 'correct horse battery staple' },
    });
    assert.equal(completed.statusCode, 200);
    assert.deepEqual(completed.json(), { userId, mfaReenrollmentRequired: true });

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery/complete',
      payload: { token: rawToken, newPassword: 'correct horse battery staple' },
    });
    assert.equal(replay.statusCode, 400);
    assert.equal(replay.json<{ code: string }>().code, 'RECOVERY_TOKEN_INVALID');
  } finally {
    await app.close();
  }
});

void test('[IAM-015] recovery HTTP fails closed without a composed service', async () => {
  const { app } = await createApiApplication();
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery',
      payload: { email: 'user@example.com' },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json<{ code: string }>().code, 'RECOVERY_UNAVAILABLE');
  } finally {
    await app.close();
  }
});
