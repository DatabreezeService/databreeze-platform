import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryRecoveryRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-recovery-repository.adapter.js';
import { PasswordCredentialService } from '../../../src/features/iam/application/password-credential.service.js';
import { RecoveryService } from '../../../src/features/iam/application/recovery.service.js';
import type { RecoveryDeliveryPortV1 } from '../../../src/features/iam/application/recovery-repository.port.js';

const userId = '00000000-0000-4000-8000-000000000001';
const token = 'recovery-token-abcdefghijklmnopqrstuvwxyz-123456';

function credentials() {
  return new PasswordCredentialService({
    hash: async (password) => ({
      schemaVersion: 1,
      algorithm: 'argon2id',
      encodedHash: `$argon2id$v=19$m=65536,p=1,t=3$YWJjZA==$${Buffer.from(password).toString('base64')}`,
    }),
    verify: async () => true,
  });
}

function service(
  repository: InMemoryRecoveryRepositoryAdapter,
  delivery: RecoveryDeliveryPortV1 = { deliver: async () => undefined },
) {
  let id = 2;
  return new RecoveryService({
    repository,
    passwordCredentials: credentials(),
    digest: {
      digestToken: () => 'a'.repeat(64),
      digestEmail: () => 'b'.repeat(64),
    },
    delivery,
    ids: { next: () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}` },
    tokens: { next: () => token },
    clock: { now: () => new Date('2026-08-03T00:00:00.000Z') },
  });
}

void test('[IAM-015] recovery request is generic for unknown email and stores a delivered hashed challenge for a known account', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({ email: 'user@example.com', userId });
  const delivered: string[] = [];
  const recovery = service(repository, {
    deliver: async (input: Parameters<RecoveryDeliveryPortV1['deliver']>[0]) => {
      delivered.push(input.rawToken);
    },
  });
  assert.deepEqual(await recovery.request('unknown@example.com'), {
    accepted: true,
    value: { requested: true },
  });
  assert.deepEqual(await recovery.request('USER@example.com'), {
    accepted: true,
    value: { requested: true },
  });
  assert.deepEqual(delivered, [token]);
  assert.equal(repository.challenge('a'.repeat(64))?.userId, userId);
  assert.equal(repository.challenge('a'.repeat(64))?.status, 'ACTIVE');
});

void test('[IAM-015] completion atomically consumes the challenge, rotates the credential, advances the epoch, revokes sessions, and requires MFA re-enrollment', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({
    email: 'user@example.com',
    userId,
    activeSessionFamilies: ['family-1', 'family-2'],
  });
  const recovery = service(repository);
  assert.equal((await recovery.request('user@example.com')).accepted, true);
  const result = await recovery.complete(token, 'new correct horse battery staple');
  assert.deepEqual(result, {
    accepted: true,
    value: { userId, mfaReenrollmentRequired: true },
  });
  assert.equal(repository.challenge('a'.repeat(64))?.status, 'CONSUMED');
  assert.equal(repository.account(userId)?.securityEpoch, 2);
  assert.equal(repository.account(userId)?.mfaReenrollmentRequired, true);
  assert.equal(repository.account(userId)?.activeSessionFamilies.size, 0);
  assert.deepEqual(await recovery.complete(token, 'another correct horse battery staple'), {
    accepted: false,
    code: 'INVALID_TOKEN',
  });
});

void test('[IAM-015] recovery delivery failures do not persist a usable challenge', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({ email: 'user@example.com', userId });
  const recovery = service(repository, {
    deliver: async () => {
      throw new Error('provider down');
    },
  });
  assert.deepEqual(await recovery.request('user@example.com'), {
    accepted: false,
    code: 'RECOVERY_UNAVAILABLE',
  });
  assert.equal(repository.challenge('a'.repeat(64)), undefined);
});
