import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryRegistrationRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-registration-repository.adapter.js';
import { PasswordCredentialService } from '../../../src/features/iam/application/password-credential.service.js';

function credentials() {
  return new PasswordCredentialService({
    hash: async () => {
      await Promise.resolve();
      return {
        schemaVersion: 1,
        algorithm: 'argon2id',
        encodedHash: '$argon2id$v=19$m=65536,p=1,t=3$YWJjZA==$ZWZmZw==',
      };
    },
    verify: async () => {
      await Promise.resolve();
      return true;
    },
  });
}

void test('[IAM-001, IAM-009, IAM-016] registration HTTP creates a personal hierarchy and rejects a duplicate generically', async () => {
  const { app } = await createApiApplication({
    registrationRepository: new InMemoryRegistrationRepositoryAdapter(),
    passwordCredentials: credentials(),
  });
  try {
    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'User@example.com',
        displayName: 'Nguyen An',
        password: 'correct horse battery staple',
      },
    });
    assert.equal(first.statusCode, 201);
    const body = first.json<Record<string, unknown>>();
    assert.match(String(body['userId']), /^[0-9a-f-]{36}$/u);
    assert.equal(body['locale'], 'vi-VN');
    assert.equal('accessToken' in body, false);
    assert.equal('email' in body, false);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'user@example.com',
        displayName: 'Different',
        password: 'correct horse battery staple',
      },
    });
    assert.equal(duplicate.statusCode, 400);
    assert.match(duplicate.headers['content-type'] ?? '', /^application\/problem\+json/u);
    assert.equal(duplicate.json<{ code: string }>().code, 'REGISTRATION_REQUEST_REJECTED');
  } finally {
    await app.close();
  }
});

void test('[IAM-001] registration HTTP fails closed when durable registration is not configured', async () => {
  const { app } = await createApiApplication();
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'user@example.com',
        displayName: 'Nguyen An',
        password: 'correct horse battery staple',
      },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json<{ code: string }>().code, 'REGISTRATION_UNAVAILABLE');
  } finally {
    await app.close();
  }
});
