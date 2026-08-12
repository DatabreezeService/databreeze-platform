import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemorySessionLifecycleAdapter } from '../../../src/features/iam/adapter/in-memory-session-lifecycle.adapter.js';
import {
  SESSION_POLICY_V1,
  sessionPolicyForPlatformV1,
} from '../../../src/features/iam/application/session-policy.v1.js';

const principal = {
  userId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  securityEpoch: 1,
  mfaRequired: false,
  mfaReenrollmentRequired: false,
};

void test('[IAM-023] SessionPolicyV1 uses Web 30/180 and native 90/365 day bounds', () => {
  assert.equal(sessionPolicyForPlatformV1('web').inactivitySeconds, 30 * 24 * 60 * 60);
  assert.equal(sessionPolicyForPlatformV1('web').absoluteSeconds, 180 * 24 * 60 * 60);
  assert.equal(sessionPolicyForPlatformV1('desktop').inactivitySeconds, 90 * 24 * 60 * 60);
  assert.equal(sessionPolicyForPlatformV1('desktop').absoluteSeconds, 365 * 24 * 60 * 60);
  assert.equal(sessionPolicyForPlatformV1('android').inactivitySeconds, 90 * 24 * 60 * 60);
  assert.equal(sessionPolicyForPlatformV1('android').absoluteSeconds, 365 * 24 * 60 * 60);
  assert.equal(SESSION_POLICY_V1.web.accessTokenSeconds, 15 * 60);
});

void test('[IAM-023] web issue uses 30-day inactivity and 180-day absolute', async () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const adapter = new InMemorySessionLifecycleAdapter({ clock: () => new Date(now) });
  const session = await adapter.issue(principal, 'web');
  assert.equal(session.accessExpiresAt, '2026-01-01T00:15:00.000Z');
  assert.equal(session.refreshExpiresAt, '2026-06-30T00:00:00.000Z');
});

void test('[IAM-023] desktop issue uses 90-day inactivity and 365-day absolute', async () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const adapter = new InMemorySessionLifecycleAdapter({ clock: () => new Date(now) });
  const session = await adapter.issue(principal, 'desktop');
  assert.equal(session.refreshExpiresAt, '2027-01-01T00:00:00.000Z');
});

void test('[IAM-005] refresh reuse still revokes family under SessionPolicyV1', async () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const adapter = new InMemorySessionLifecycleAdapter({ clock: () => new Date(now) });
  const first = await adapter.issue(principal, 'web');
  const rotated = await adapter.refresh(first.refreshToken, 'web');
  assert.equal(rotated.accepted, true);
  const reuse = await adapter.refresh(first.refreshToken, 'web');
  assert.deepEqual(reuse, { accepted: false, code: 'REUSE_DETECTED' });
});

void test('[IAM-023] logout-current and logout-all revoke session families', async () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const adapter = new InMemorySessionLifecycleAdapter({ clock: () => new Date(now) });
  const first = await adapter.issue(principal, 'web');
  const second = await adapter.issue(principal, 'desktop');
  assert.equal(await adapter.revoke(first.sessionId), true);
  assert.equal(await adapter.findPrincipal(first.sessionId), undefined);
  assert.equal(await adapter.revokeAllForUser(principal.userId), 1);
  assert.equal(await adapter.findPrincipal(second.sessionId), undefined);
});
