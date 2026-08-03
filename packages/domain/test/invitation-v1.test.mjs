import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INVITATION_MAX_SECONDS_V1,
  consumeInvitationTokenV1,
  createInvitationTokenV1,
} from '@databreeze/domain/invitation/v1';

const ids = {
  invitation: '00000000-0000-4000-8000-000000000301',
  membership: '00000000-0000-4000-8000-000000000302',
  principal: '00000000-0000-4000-8000-000000000303',
  organization: '00000000-0000-4000-8000-000000000304',
};
const scope = { scopeType: 'organization', organizationId: ids.organization };
const issuedAt = '2026-08-03T00:00:00.000Z';
const expiresAt = new Date(Date.parse(issuedAt) + INVITATION_MAX_SECONDS_V1 * 1_000).toISOString();

function input(overrides = {}) {
  return {
    id: ids.invitation,
    membershipId: ids.membership,
    principalId: ids.principal,
    scope,
    roleId: 'viewer',
    tokenDigest: 'a'.repeat(64),
    emailDigest: 'b'.repeat(64),
    issuedAt,
    expiresAt,
    ...overrides,
  };
}

void test('[IAM-010] invitation token binds exact scope, role, principal, and recipient digest', () => {
  const result = createInvitationTokenV1(input());
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.status, 'ACTIVE');
  assert.equal(result.value.revision, 1);
  assert.equal(result.value.scope.scopeType, 'organization');
  assert.equal(result.value.roleId, 'viewer');
  assert.equal(result.value.emailDigest, 'b'.repeat(64));
});

void test('[IAM-010] invitation token cannot exceed seven days or carry invalid digests', () => {
  assert.deepEqual(
    createInvitationTokenV1({
      ...input(),
      tokenDigest: 'not-a-digest',
    }),
    { accepted: false, code: 'INVALID_DIGEST' },
  );
  assert.deepEqual(
    createInvitationTokenV1({
      ...input(),
      expiresAt: new Date(
        Date.parse(issuedAt) + (INVITATION_MAX_SECONDS_V1 + 1) * 1_000,
      ).toISOString(),
    }),
    { accepted: false, code: 'INVALID_LIFETIME' },
  );
});

void test('[IAM-010] consuming an active token is one-time and revisioned', () => {
  const created = createInvitationTokenV1(input());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const consumed = consumeInvitationTokenV1(created.value, issuedAt);
  assert.equal(consumed.accepted, true);
  if (!consumed.accepted) return;
  assert.equal(consumed.value.status, 'REDEEMED');
  assert.equal(consumed.value.revision, 2);
  assert.deepEqual(consumeInvitationTokenV1(consumed.value, issuedAt), {
    accepted: false,
    code: 'ALREADY_CONSUMED',
  });
});

void test('[IAM-010] consuming after expiry or before issue fails closed', () => {
  const created = createInvitationTokenV1(input());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.deepEqual(
    consumeInvitationTokenV1(created.value, new Date(Date.parse(expiresAt) + 1).toISOString()),
    { accepted: false, code: 'EXPIRED' },
  );
  assert.deepEqual(
    consumeInvitationTokenV1(created.value, new Date(Date.parse(issuedAt) - 1).toISOString()),
    { accepted: false, code: 'INVALID_TIMESTAMP' },
  );
});
