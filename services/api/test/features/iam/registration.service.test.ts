import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryRegistrationRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-registration-repository.adapter.js';
import { PasswordCredentialService } from '../../../src/features/iam/application/password-credential.service.js';
import { RegistrationService } from '../../../src/features/iam/application/registration.service.js';

function ids() {
  let next = 1;
  return {
    next: () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
  };
}

function passwordCredentials() {
  return new PasswordCredentialService({
    hash: async () => {
      await Promise.resolve();
      return {
        schemaVersion: 1 as const,
        algorithm: 'argon2id' as const,
        encodedHash: '$argon2id$v=19$m=65536,p=1,t=3$YWJjZA==$ZWZmZw==',
      };
    },
    verify: async () => {
      await Promise.resolve();
      return true;
    },
  });
}

void test('[IAM-001, IAM-009, IAM-016] registration atomically creates a Vietnamese personal owner hierarchy', async () => {
  const repository = new InMemoryRegistrationRepositoryAdapter();
  const service = new RegistrationService({
    repository,
    passwordCredentials: passwordCredentials(),
    ids: ids(),
    clock: { now: () => new Date('2026-08-03T00:00:00.000Z') },
  });
  const result = await service.register({
    email: 'User@Example.com',
    displayName: 'Nguyen An',
    password: 'correct horse battery staple',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.email, 'user@example.com');
  assert.equal(result.value.bootstrap.user.locale, 'vi-VN');
  assert.equal(result.value.bootstrap.membership.roleId, 'owner');
  assert.equal(result.value.bootstrap.organization.personal, true);
  assert.equal(repository.has('user@example.com'), true);
  assert.equal(
    repository.get('user@example.com')?.credential.encodedHash.includes('password'),
    false,
  );
});

void test('[IAM-001] registration rejects duplicate email without disclosing account state', async () => {
  const repository = new InMemoryRegistrationRepositoryAdapter();
  const service = new RegistrationService({
    repository,
    passwordCredentials: passwordCredentials(),
    ids: ids(),
  });
  assert.equal(
    (
      await service.register({
        email: 'same@example.com',
        displayName: 'One',
        password: 'valid password here',
      })
    ).accepted,
    true,
  );
  assert.deepEqual(
    await service.register({
      email: 'SAME@example.com',
      displayName: 'Two',
      password: 'valid password here',
    }),
    { accepted: false, code: 'REGISTRATION_REJECTED' },
  );
});

void test('[IAM-001] registration validates input before persistence and maps hash failure safely', async () => {
  const repository = new InMemoryRegistrationRepositoryAdapter();
  const service = new RegistrationService({
    repository,
    passwordCredentials: passwordCredentials(),
    ids: ids(),
  });
  assert.deepEqual(
    await service.register({
      email: 'not-an-email',
      displayName: 'Name',
      password: 'valid password here',
    }),
    { accepted: false, code: 'INVALID_INPUT' },
  );
  const unavailable = new RegistrationService({
    repository,
    passwordCredentials: new PasswordCredentialService({
      hash: async () => {
        await Promise.resolve();
        throw new Error('hash');
      },
      verify: async () => {
        await Promise.resolve();
        return false;
      },
    }),
    ids: ids(),
  });
  assert.deepEqual(
    await unavailable.register({
      email: 'new@example.com',
      displayName: 'Name',
      password: 'valid password here',
    }),
    { accepted: false, code: 'REGISTRATION_UNAVAILABLE' },
  );
});

void test('[IAM-001] registration rolls back when persistence fails after staging', async () => {
  const repository = new InMemoryRegistrationRepositoryAdapter();
  const service = new RegistrationService({
    repository: {
      withTransaction: async (work) =>
        work({
          findByEmail: async () => {
            await Promise.resolve();
            return false;
          },
          save: async () => {
            await Promise.resolve();
            throw new Error('database unavailable');
          },
        }),
    },
    passwordCredentials: passwordCredentials(),
    ids: ids(),
  });
  assert.deepEqual(
    await service.register({
      email: 'new@example.com',
      displayName: 'Name',
      password: 'valid password here',
    }),
    { accepted: false, code: 'REGISTRATION_UNAVAILABLE' },
  );
  assert.equal(repository.has('new@example.com'), false);
});
