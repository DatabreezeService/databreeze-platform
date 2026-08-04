import assert from 'node:assert/strict';
import test from 'node:test';

import { Argon2PasswordHasherAdapter } from '../../../src/features/iam/adapter/argon2-password-hasher.adapter.js';
import { AuthenticationService } from '../../../src/features/iam/application/authentication.service.js';
import { PasswordCredentialService } from '../../../src/features/iam/application/password-credential.service.js';

const principal = {
  userId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  securityEpoch: 1,
  mfaRequired: false,
  mfaReenrollmentRequired: false,
};

void test('[IAM-001, IAM-005, IAM-006] authentication normalizes email and delegates opaque session issuance', async () => {
  const passwordCredentials = new PasswordCredentialService(new Argon2PasswordHasherAdapter());
  const created = await passwordCredentials.create('correct horse battery staple');
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const service = new AuthenticationService({
    passwordCredentials,
    credentials: {
      findCredential: (email) =>
        Promise.resolve(
          email === 'user@example.com' ? { principal, credential: created.value } : undefined,
        ),
    },
    sessions: {
      issue: () =>
        Promise.resolve({
          sessionId: '00000000-0000-4000-8000-000000000010',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          accessExpiresAt: '2026-01-01T00:15:00.000Z',
        }),
    },
  });
  const result = await service.signIn({
    email: 'USER@Example.COM',
    password: 'correct horse battery staple',
    clientPlatform: 'web',
  });
  assert.equal(result.accepted, true);
  if (result.accepted) {
    assert.equal(result.value.principal.userId, principal.userId);
    assert.equal(result.value.session.refreshToken, 'refresh-token');
  }
});

void test('[IAM-001, IAM-006] authentication returns one safe failure for unknown or invalid credentials', async () => {
  const passwordCredentials = new PasswordCredentialService(new Argon2PasswordHasherAdapter());
  const service = new AuthenticationService({
    passwordCredentials,
    credentials: { findCredential: () => Promise.resolve(undefined) },
    sessions: { issue: () => Promise.reject(new Error('not reached')) },
  });
  assert.deepEqual(
    await service.signIn({
      email: 'unknown@example.com',
      password: 'correct horse battery staple',
      clientPlatform: 'web',
    }),
    {
      accepted: false,
      code: 'INVALID_CREDENTIALS',
    },
  );
  const validPassword = await passwordCredentials.create('correct horse battery staple');
  assert.equal(validPassword.accepted, true);
  if (validPassword.accepted) {
    const invalidPasswordService = new AuthenticationService({
      passwordCredentials,
      credentials: {
        findCredential: () => Promise.resolve({ principal, credential: validPassword.value }),
      },
      sessions: { issue: () => Promise.reject(new Error('not reached')) },
    });
    assert.deepEqual(
      await invalidPasswordService.signIn({
        email: 'user@example.com',
        password: 'wrong horse battery staple',
        clientPlatform: 'web',
      }),
      { accepted: false, code: 'INVALID_CREDENTIALS' },
    );
  }
  assert.deepEqual(
    await service.signIn({
      email: 'not-an-email',
      password: 'correct horse battery staple',
      clientPlatform: 'web',
    }),
    {
      accepted: false,
      code: 'INVALID_CREDENTIALS',
    },
  );
});

void test('[IAM-006] authentication hides session-provider failures behind a retryable code', async () => {
  const passwordCredentials = new PasswordCredentialService(new Argon2PasswordHasherAdapter());
  const created = await passwordCredentials.create('correct horse battery staple');
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const service = new AuthenticationService({
    passwordCredentials,
    credentials: {
      findCredential: () => Promise.resolve({ principal, credential: created.value }),
    },
    sessions: {
      issue: () => Promise.reject(new Error('provider details must not escape')),
    },
  });
  assert.deepEqual(
    await service.signIn({
      email: 'user@example.com',
      password: 'correct horse battery staple',
      clientPlatform: 'web',
    }),
    { accepted: false, code: 'AUTHENTICATION_UNAVAILABLE' },
  );
});

void test('[IAM-005] authentication rejects a principal without the MFA re-enrollment state', async () => {
  const passwordCredentials = new PasswordCredentialService(new Argon2PasswordHasherAdapter());
  const created = await passwordCredentials.create('correct horse battery staple');
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const service = new AuthenticationService({
    passwordCredentials,
    credentials: {
      findCredential: () =>
        Promise.resolve({
          principal: { ...principal, mfaReenrollmentRequired: undefined } as never,
          credential: created.value,
        }),
    },
    sessions: { issue: () => Promise.reject(new Error('must not issue')) },
  });
  assert.deepEqual(
    await service.signIn({
      email: 'user@example.com',
      password: 'correct horse battery staple',
      clientPlatform: 'web',
    }),
    { accepted: false, code: 'AUTHENTICATION_UNAVAILABLE' },
  );
});
