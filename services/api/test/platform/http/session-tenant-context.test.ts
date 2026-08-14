import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionRequestTenantContextAdapter } from '../../../src/platform/http/session-tenant-context.adapter.js';

const principal = {
  userId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  securityEpoch: 7,
  mfaRequired: false,
  mfaReenrollmentRequired: false,
};
const correlationId = '00000000-0000-4000-8000-000000000010';

function workspaceEpoch(value = principal.securityEpoch) {
  return {
    resolveWorkspaceAuthorizationEpoch: () => Promise.resolve(value),
  };
}

void test('derives a workspace tenant context from a bearer session and never accepts client scope fields', async () => {
  const seen: string[] = [];
  const adapter = new SessionRequestTenantContextAdapter(
    {
      findPrincipalByAccessToken: (token) => {
        seen.push(String(token));
        return Promise.resolve(principal);
      },
    },
    workspaceEpoch(),
  );

  const context = await adapter.resolve({
    id: 'request-001',
    headers: {
      authorization: 'Bearer opaque-access-token-1',
      'idempotency-key': 'mutation-001',
      'x-correlation-id': correlationId,
    },
    body: {
      organizationId: '00000000-0000-4000-8000-000000000099',
      workspaceId: '00000000-0000-4000-8000-000000000099',
    },
  });

  assert.deepEqual(seen, ['opaque-access-token-1']);
  assert.deepEqual(context, {
    tenantScope: {
      scopeType: 'workspace',
      organizationId: principal.organizationId,
      workspaceId: principal.workspaceId,
    },
    actorId: principal.userId,
    correlationId,
    idempotencyKey: 'mutation-001',
    authorizationEpoch: principal.securityEpoch,
    mfaRequired: principal.mfaRequired,
    mfaReenrollmentRequired: false,
    workspaceAuthorizationEpoch: principal.securityEpoch,
  });
});

void test('rejects missing, ambiguous, malformed, and unknown bearer credentials', async () => {
  const adapter = new SessionRequestTenantContextAdapter(
    {
      findPrincipalByAccessToken: () => Promise.resolve(undefined),
    },
    workspaceEpoch(),
  );
  for (const request of [
    { headers: {} },
    { headers: { authorization: ['Bearer one', 'Bearer two'] } },
    { headers: { authorization: 'Basic credential' } },
    { headers: { authorization: 'Bearer' } },
  ]) {
    await assert.rejects(adapter.resolve(request), (error: unknown) => {
      assert.equal((error as { code?: unknown }).code, 'AUTHENTICATION_FAILED');
      return true;
    });
  }
});

void test('uses the request id for read-only calls and rejects unsafe principal state', async () => {
  const adapter = new SessionRequestTenantContextAdapter(
    {
      findPrincipalByAccessToken: () => Promise.resolve({ ...principal, securityEpoch: 0 }),
    },
    workspaceEpoch(),
  );
  await assert.rejects(
    adapter.resolve({
      id: 'request-read-001',
      method: 'GET',
      headers: { authorization: 'Bearer opaque-access-token-123456789' },
    }),
    (error: unknown) => {
      assert.equal((error as { code?: unknown }).code, 'CONTEXT_INVALID');
      return true;
    },
  );
});

void test('[IAM-015] carries the live recovery re-enrollment gate into protected request context', async () => {
  const adapter = new SessionRequestTenantContextAdapter(
    {
      findPrincipalByAccessToken: () =>
        Promise.resolve({ ...principal, mfaReenrollmentRequired: true }),
    },
    workspaceEpoch(),
  );
  const context = await adapter.resolve({
    method: 'GET',
    headers: { authorization: 'Bearer opaque-access-token-123456789' },
  });
  assert.equal(context.mfaReenrollmentRequired, true);
});

void test('[IAM-005] rejects a session principal that omits the MFA re-enrollment state', async () => {
  const adapter = new SessionRequestTenantContextAdapter(
    {
      findPrincipalByAccessToken: () =>
        Promise.resolve({ ...principal, mfaReenrollmentRequired: undefined } as never),
    },
    workspaceEpoch(),
  );
  await assert.rejects(
    adapter.resolve({
      method: 'GET',
      headers: { authorization: 'Bearer opaque-access-token-123456789' },
    }),
    (error: unknown) => {
      assert.equal((error as { code?: unknown }).code, 'CONTEXT_INVALID');
      return true;
    },
  );
});

void test('requires an explicit idempotency key for authenticated mutations', async () => {
  const adapter = new SessionRequestTenantContextAdapter(
    {
      findPrincipalByAccessToken: () => Promise.resolve(principal),
    },
    workspaceEpoch(),
  );

  await assert.rejects(
    adapter.resolve({
      id: 'request-mutation-001',
      method: 'POST',
      headers: { authorization: 'Bearer opaque-access-token-123456789' },
    }),
    (error: unknown) => {
      assert.equal((error as { code?: unknown }).code, 'CONTEXT_INVALID');
      return true;
    },
  );
});

void test('reports session authority outages separately from rejected bearer credentials', async () => {
  const adapter = new SessionRequestTenantContextAdapter(
    {
      findPrincipalByAccessToken: () => Promise.reject(new Error('database unavailable')),
    },
    workspaceEpoch(),
  );
  await assert.rejects(
    adapter.resolve({
      headers: { authorization: 'Bearer opaque-access-token-123456789' },
    }),
    (error: unknown) => {
      assert.equal((error as { code?: unknown }).code, 'AUTHENTICATION_UNAVAILABLE');
      return true;
    },
  );
});

void test('[IAM-024] resolves the live workspace authorization epoch on every session context request', async () => {
  let epoch = 11;
  const adapter = new SessionRequestTenantContextAdapter(
    { findPrincipalByAccessToken: () => Promise.resolve(principal) },
    { resolveWorkspaceAuthorizationEpoch: () => Promise.resolve(epoch) },
  );
  const request = {
    method: 'GET',
    headers: { authorization: 'Bearer opaque-access-token-123456789' },
  };
  const first = await adapter.resolve(request);
  assert.equal(first.authorizationEpoch, principal.securityEpoch);
  assert.equal(first.workspaceAuthorizationEpoch, 11);
  epoch = 12;
  const second = await adapter.resolve(request);
  assert.equal(second.workspaceAuthorizationEpoch, 12);
});
