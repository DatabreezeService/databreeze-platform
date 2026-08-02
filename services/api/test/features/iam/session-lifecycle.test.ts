import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemorySessionLifecycleAdapter } from '../../../src/features/iam/adapter/in-memory-session-lifecycle.adapter.js';

const principal = {
  userId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  securityEpoch: 1,
  mfaRequired: false,
};

void test('[IAM-005, IAM-006] session issuer creates opaque bounded sessions', async () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const adapter = new InMemorySessionLifecycleAdapter({ clock: () => new Date(now) });
  const session = await adapter.issue(principal, 'web');
  assert.match(session.sessionId, /^[0-9a-f-]{36}$/u);
  assert.match(session.accessToken, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/u);
  assert.match(session.refreshToken, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/u);
  assert.equal(session.accessExpiresAt, '2026-01-01T00:15:00.000Z');
  assert.equal(adapter.findPrincipal(session.sessionId)?.userId, principal.userId);
});

void test('[IAM-005] refresh rotation is single-use and reuse revokes the family', async () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const adapter = new InMemorySessionLifecycleAdapter({ clock: () => new Date(now) });
  const first = await adapter.issue(principal, 'desktop');
  const rotated = await adapter.refresh(first.refreshToken, 'desktop');
  assert.equal(rotated.accepted, true);
  if (!rotated.accepted) return;
  assert.notEqual(rotated.value.refreshToken, first.refreshToken);
  const reuse = await adapter.refresh(first.refreshToken, 'desktop');
  assert.deepEqual(reuse, { accepted: false, code: 'REUSE_DETECTED' });
  assert.equal(adapter.findPrincipal(first.sessionId), undefined);
  assert.deepEqual(await adapter.refresh(rotated.value.refreshToken, 'desktop'), {
    accepted: false,
    code: 'REVOKED_FAMILY',
  });
});

void test('[IAM-005] expired and malformed refresh tokens fail without token disclosure', async () => {
  let now = new Date('2026-01-01T00:00:00.000Z');
  const adapter = new InMemorySessionLifecycleAdapter({ clock: () => new Date(now) });
  const session = await adapter.issue(principal, 'android');
  now = new Date('2026-02-01T00:00:00.000Z');
  assert.deepEqual(await adapter.refresh(session.refreshToken, 'android'), {
    accepted: false,
    code: 'EXPIRED',
  });
  assert.deepEqual(await adapter.refresh('not-a-token', 'android'), {
    accepted: false,
    code: 'INVALID_REFRESH_TOKEN',
  });
});
