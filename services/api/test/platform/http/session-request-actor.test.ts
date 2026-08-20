import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionRequestActorAdapter } from '../../../src/platform/http/session-request-actor.adapter.js';
import { RequestTenantContextProblemError } from '../../../src/platform/http/request-tenant-context.port.js';

const userId = '00000000-0000-4000-8000-000000000001';

void test('[IAM-026] resolves a platform-only actor without manufacturing tenant scope', async () => {
  const adapter = new SessionRequestActorAdapter({
    findSessionByAccessToken: async () => ({
      sessionId: '00000000-0000-4000-8000-000000000002',
      principal: {
        scopeType: 'PLATFORM',
        userId,
        securityEpoch: 3,
        mfaRequired: false,
        mfaReenrollmentRequired: false,
      },
    }),
  });

  assert.deepEqual(
    await adapter.resolve({
      method: 'GET',
      headers: { authorization: 'Bearer opaque-access-token-123456789' },
    }),
    {
      sessionId: '00000000-0000-4000-8000-000000000002',
      actorId: userId,
      scopeType: 'PLATFORM',
      securityEpoch: 3,
      mfaRequired: false,
      mfaReenrollmentRequired: false,
    },
  );
});

void test('[IAM-005] rejects malformed persisted session identity at the actor boundary', async () => {
  const adapter = new SessionRequestActorAdapter({
    findSessionByAccessToken: async () => ({
      sessionId: 'not-a-session-id',
      principal: {
        scopeType: 'PLATFORM',
        userId,
        securityEpoch: 3,
        mfaRequired: false,
        mfaReenrollmentRequired: false,
      },
    }),
  });

  await assert.rejects(
    adapter.resolve({ headers: { authorization: 'Bearer opaque-access-token-123456789' } }),
    (error) =>
      error instanceof RequestTenantContextProblemError && error.code === 'AUTHENTICATION_FAILED',
  );
});
