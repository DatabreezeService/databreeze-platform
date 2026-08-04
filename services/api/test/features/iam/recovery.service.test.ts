import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryRecoveryRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-recovery-repository.adapter.js';
import { InMemoryRecoveryAdmissionAdapter } from '../../../src/features/iam/adapter/in-memory-recovery-admission.adapter.js';
import { PasswordCredentialService } from '../../../src/features/iam/application/password-credential.service.js';
import { RecoveryService } from '../../../src/features/iam/application/recovery.service.js';
import type {
  RecoveryDeliveryPortV1,
  RecoveryRepositoryPortV1,
} from '../../../src/features/iam/application/recovery-repository.port.js';

const userId = '00000000-0000-4000-8000-000000000001';
const token = 'recovery-token-abcdefghijklmnopqrstuvwxyz-123456';

function credentials() {
  return new PasswordCredentialService({
    hash: async (password) => {
      await Promise.resolve();
      return {
        schemaVersion: 1,
        algorithm: 'argon2id',
        encodedHash: `$argon2id$v=19$m=65536,p=1,t=3$YWJjZA==$${Buffer.from(password).toString('base64')}`,
      };
    },
    verify: async () => {
      await Promise.resolve();
      return true;
    },
  });
}

function countingCredentials(counter: { value: number }) {
  return new PasswordCredentialService({
    hash: async (password) => {
      await Promise.resolve();
      counter.value += 1;
      return {
        schemaVersion: 1,
        algorithm: 'argon2id',
        encodedHash: `$argon2id$v=19$m=65536,p=1,t=3$YWJjZA==$${Buffer.from(password).toString('base64')}`,
      };
    },
    verify: async () => {
      await Promise.resolve();
      return true;
    },
  });
}

function service(
  repository: InMemoryRecoveryRepositoryAdapter,
  delivery: RecoveryDeliveryPortV1 = {
    deliver: async () => {
      await Promise.resolve();
    },
  },
  admission?: InMemoryRecoveryAdmissionAdapter,
  passwordCredentials: PasswordCredentialService = credentials(),
  completionAdmission?: InMemoryRecoveryAdmissionAdapter,
  digestToken: () => string = () => 'a'.repeat(64),
) {
  let id = 2;
  return new RecoveryService({
    repository,
    passwordCredentials,
    digest: {
      digestToken,
      digestEmail: () => 'b'.repeat(64),
    },
    delivery,
    ids: { next: () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}` },
    tokens: { next: () => token },
    clock: { now: () => new Date('2026-08-03T00:00:00.000Z') },
    ...(admission ? { admission } : {}),
    ...(completionAdmission ? { completionAdmission } : {}),
  });
}

void test('[IAM-015] invalid recovery tokens do not invoke the password hasher', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  const counter = { value: 0 };
  const recovery = service(repository, undefined, undefined, countingCredentials(counter));

  assert.deepEqual(
    await recovery.complete(
      'invalid-token-abcdefghijklmnopqrstuvwxyz-123456',
      'new correct horse battery staple',
    ),
    {
      accepted: false,
      code: 'INVALID_TOKEN',
    },
  );
  assert.equal(counter.value, 0);
});

void test('[IAM-015] completion admission consumes unknown token attempts before challenge lookup', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({ email: 'user@example.com', userId });
  const completionAdmission = new InMemoryRecoveryAdmissionAdapter({
    maxAttempts: 1,
    windowSeconds: 60,
  });
  const recovery = service(repository, undefined, undefined, credentials(), completionAdmission);

  assert.deepEqual(await recovery.complete(token, 'new correct horse battery staple'), {
    accepted: false,
    code: 'INVALID_TOKEN',
  });
  assert.equal((await recovery.request('user@example.com')).accepted, true);
  assert.deepEqual(await recovery.complete(token, 'new correct horse battery staple'), {
    accepted: false,
    code: 'INVALID_TOKEN',
  });
  assert.equal(repository.challenge('a'.repeat(64))?.status, 'ACTIVE');
});

void test('[IAM-015] recovery request is generic for unknown email and stores a delivered hashed challenge for a known account', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({ email: 'user@example.com', userId });
  const delivered: string[] = [];
  const recovery = service(repository, {
    deliver: async (input: Parameters<RecoveryDeliveryPortV1['deliver']>[0]) => {
      await Promise.resolve();
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

void test('[IAM-015] recovery persists the challenge before delivery', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({ email: 'user@example.com', userId });
  let persistedDuringDelivery = false;
  const recovery = service(repository, {
    deliver: async () => {
      await Promise.resolve();
      persistedDuringDelivery = repository.challenge('a'.repeat(64))?.status === 'ACTIVE';
    },
  });

  assert.deepEqual(await recovery.request('user@example.com'), {
    accepted: true,
    value: { requested: true },
  });
  assert.equal(persistedDuringDelivery, true);
});

void test('[IAM-015] recovery revokes a previous challenge before delivering its replacement', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({ email: 'user@example.com', userId });
  const digests: readonly [string, string] = ['a'.repeat(64), 'c'.repeat(64)];
  let digestIndex = 0;
  let replacementState: {
    readonly previous: string | undefined;
    readonly replacement: string | undefined;
  } = { previous: undefined, replacement: undefined };
  const recovery = service(
    repository,
    {
      deliver: async () => {
        await Promise.resolve();
        replacementState = {
          previous: repository.challenge(digests[0])?.status,
          replacement: repository.challenge(digests[1])?.status,
        };
      },
    },
    undefined,
    credentials(),
    undefined,
    () => {
      const digest = digests[digestIndex] ?? digests[1];
      digestIndex += 1;
      return digest;
    },
  );

  assert.equal((await recovery.request('user@example.com')).accepted, true);
  assert.equal((await recovery.request('user@example.com')).accepted, true);
  assert.deepEqual(replacementState, { previous: 'REVOKED', replacement: 'ACTIVE' });
});

void test('[IAM-015] recovery admission throttles known and unknown requests through one generic outcome', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({ email: 'user@example.com', userId });
  const delivered: string[] = [];
  const admission = new InMemoryRecoveryAdmissionAdapter({ maxAttempts: 1, windowSeconds: 60 });
  const recovery = service(
    repository,
    {
      deliver: async ({ rawToken }) => {
        await Promise.resolve();
        delivered.push(rawToken);
      },
    },
    admission,
  );
  assert.deepEqual(await recovery.request('unknown@example.com'), {
    accepted: true,
    value: { requested: true },
  });
  assert.deepEqual(await recovery.request('user@example.com'), {
    accepted: true,
    value: { requested: true },
  });
  assert.deepEqual(delivered, []);
  assert.equal(repository.challenge('a'.repeat(64)), undefined);
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

void test('[IAM-015] recovery delivery failures revoke the new challenge', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({ email: 'user@example.com', userId });
  const recovery = service(repository, {
    deliver: async () => {
      await Promise.resolve();
      throw new Error('provider down');
    },
  });
  assert.deepEqual(await recovery.request('user@example.com'), {
    accepted: false,
    code: 'RECOVERY_UNAVAILABLE',
  });
  assert.equal(repository.challenge('a'.repeat(64))?.status, 'REVOKED');
});

void test('[IAM-015] recovery blocks completion when compensating revocation cannot be persisted', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({ email: 'user@example.com', userId });
  const failingCompensationRepository: RecoveryRepositoryPortV1 = {
    withTransaction: (work) =>
      repository.withTransaction((transaction) =>
        work({
          ...transaction,
          saveChallenge: async (challenge) => {
            if (challenge.status === 'REVOKED') throw new Error('compensation unavailable');
            await transaction.saveChallenge(challenge);
          },
        }),
      ),
  };
  const recovery = new RecoveryService({
    repository: failingCompensationRepository,
    passwordCredentials: credentials(),
    digest: { digestToken: () => 'a'.repeat(64), digestEmail: () => 'b'.repeat(64) },
    delivery: {
      deliver: () => Promise.reject(new Error('provider down')),
    },
    ids: { next: () => '00000000-0000-4000-8000-000000000002' },
    tokens: { next: () => token },
    clock: { now: () => new Date('2026-08-03T00:00:00.000Z') },
  });
  assert.deepEqual(await recovery.request('user@example.com'), {
    accepted: false,
    code: 'RECOVERY_UNAVAILABLE',
  });
  assert.equal(repository.challenge('a'.repeat(64))?.status, 'ACTIVE');
  assert.deepEqual(await recovery.complete(token, 'new correct horse battery staple'), {
    accepted: false,
    code: 'INVALID_TOKEN',
  });
});

void test('[IAM-015] recovery persistence conflicts preserve an existing active challenge', async () => {
  const repository = new InMemoryRecoveryRepositoryAdapter();
  repository.seed({ email: 'user@example.com', userId });
  let failDelivery = false;
  const recovery = service(repository, {
    deliver: async () => {
      await Promise.resolve();
      if (failDelivery) throw new Error('provider down');
    },
  });
  assert.equal((await recovery.request('user@example.com')).accepted, true);
  failDelivery = true;
  assert.deepEqual(await recovery.request('user@example.com'), {
    accepted: false,
    code: 'RECOVERY_UNAVAILABLE',
  });
  assert.equal(repository.challenge('a'.repeat(64))?.status, 'ACTIVE');
});
