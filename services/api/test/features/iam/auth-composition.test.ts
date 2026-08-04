import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { Argon2PasswordHasherAdapter } from '../../../src/features/iam/adapter/argon2-password-hasher.adapter.js';
import { InMemoryCredentialLookupAdapter } from '../../../src/features/iam/adapter/in-memory-credential-lookup.adapter.js';
import { InMemorySessionLifecycleAdapter } from '../../../src/features/iam/adapter/in-memory-session-lifecycle.adapter.js';
import { PasswordCredentialService } from '../../../src/features/iam/application/password-credential.service.js';

const principal = {
  userId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  securityEpoch: 1,
  mfaRequired: false,
  mfaReenrollmentRequired: false,
};

void test('[IAM-001, IAM-005, IAM-006] configured credentials and sessions issue sign-in responses', async () => {
  const passwordCredentials = new PasswordCredentialService(new Argon2PasswordHasherAdapter());
  const created = await passwordCredentials.create('correct horse battery staple');
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const credentials = new InMemoryCredentialLookupAdapter();
  credentials.seed('User@Example.com', principal, created.value);
  const sessions = new InMemorySessionLifecycleAdapter({
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  const { app } = await createApiApplication({ credentials, passwordCredentials, sessions });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: {
        email: 'USER@EXAMPLE.COM',
        password: 'correct horse battery staple',
        clientPlatform: 'web',
      },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json<{
      sessionId: string;
      accessToken: string;
      refreshToken: string;
    }>();
    assert.match(body.sessionId, /^[0-9a-f-]{36}$/u);
    assert.notEqual(body.accessToken, body.refreshToken);
  } finally {
    await app.close();
  }
});
