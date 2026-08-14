/* eslint-disable @typescript-eslint/require-await -- registration doubles implement asynchronous ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { HmacSha256IamRegistrationAdmissionDigestAdapter } from '../../../src/features/iam/adapter/iam-registration-crypto.adapter.js';
import { InMemoryRecoveryAdmissionAdapter } from '../../../src/features/iam/adapter/in-memory-recovery-admission.adapter.js';

const admissionDigest = new HmacSha256IamRegistrationAdmissionDigestAdapter('r'.repeat(32));
const challengeId = '00000000-0000-4000-8000-000000000301';

void test('[IAM-022] registration HTTP accepts email/password and returns only an opaque challenge', async () => {
  const { app } = await createApiApplication({
    emailVerificationService: {
      requestEmailVerification: async () => ({
        accepted: true as const,
        value: { requested: true as const, challengeId },
      }),
    } as never,
    registrationIpAdmission: new InMemoryRecoveryAdmissionAdapter(),
    registrationEmailAdmission: new InMemoryRecoveryAdmissionAdapter(),
    registrationAdmissionDigest: admissionDigest,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        schemaVersion: 4,
        email: 'User@example.com',
        password: 'correct horse battery staple',
        locale: 'vi-VN',
      },
    });
    assert.equal(response.statusCode, 202);
    assert.deepEqual(response.json(), {
      schemaVersion: 4,
      accepted: true,
      value: { requested: true, challengeId },
    });
    assert.equal('accessToken' in response.json<Record<string, unknown>>(), false);
    assert.equal('email' in response.json<Record<string, unknown>>(), false);
  } finally {
    await app.close();
  }
});

void test('[IAM-022] registration HTTP fails closed when protected delivery is not configured', async () => {
  const { app } = await createApiApplication();
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        schemaVersion: 4,
        email: 'user@example.com',
        password: 'correct horse battery staple',
        locale: 'vi-VN',
      },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json<{ code: string }>().code, 'REGISTRATION_UNAVAILABLE');
  } finally {
    await app.close();
  }
});
