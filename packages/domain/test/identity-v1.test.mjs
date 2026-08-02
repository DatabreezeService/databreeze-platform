import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCESS_TOKEN_MAX_SECONDS_V1,
  bootstrapPersonalOrganizationV1,
  checkOwnerRemovalV1,
  consumeDeviceEnrollmentChallengeV1,
  createDeviceEnrollmentChallengeV1,
  createDeviceIdentityV1,
  createSessionRecordV1,
  createUserIdentityV1,
  isFreshStepUpV1,
  normalizeEmailAddressV1,
  rotateRefreshFamilyV1,
  rotateDeviceIdentityKeyV1,
  transitionDeviceIdentityV1,
  validateMembershipV1,
} from '../dist/identity/v1.js';

const id = (tail) => `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const createdAt = '2026-01-01T00:00:00.000Z';

test('[IAM-001, IAM-016] normalizes email and defaults a new user to Vietnamese', () => {
  assert.deepEqual(normalizeEmailAddressV1('User@Example.COM'), {
    accepted: true,
    value: 'user@example.com',
  });
  assert.deepEqual(normalizeEmailAddressV1('invalid'), { accepted: false, code: 'INVALID_TEXT' });
  const user = createUserIdentityV1({ id: id('1'), displayName: '  Nguyễn An  ', createdAt });
  assert.equal(user.accepted, true);
  if (user.accepted) assert.equal(user.value.locale, 'vi-VN');
});

test('[IAM-001, IAM-009, IAM-011] bootstrap creates one scoped personal owner', () => {
  const result = bootstrapPersonalOrganizationV1({
    user: { id: id('1'), displayName: 'An', createdAt },
    organizationId: id('2'),
    workspaceId: id('3'),
    projectId: id('4'),
    membershipId: id('5'),
    createdAt,
  });
  assert.equal(result.accepted, true);
  if (result.accepted) {
    assert.equal(result.value.organization.personal, true);
    assert.equal(result.value.membership.roleId, 'owner');
    assert.equal(result.value.membership.scope.scopeType, 'organization');
    assert.equal(result.value.workspace.organizationId, result.value.organization.id);
  }
});

test('[IAM-010, IAM-019] membership validation rejects an invitation over seven days', () => {
  const result = validateMembershipV1({
    id: id('10'),
    principalType: 'USER',
    principalId: id('1'),
    scope: { scopeType: 'workspace', organizationId: id('2'), workspaceId: id('3') },
    roleId: 'viewer',
    status: 'INVITED',
    startsAt: createdAt,
    expiresAt: '2026-01-10T00:00:00.000Z',
    revision: 1,
  });
  assert.deepEqual(result, { accepted: false, code: 'INVALID_LIFETIME' });
});

test('[IAM-011] last owner cannot be removed', () => {
  const membership = validateMembershipV1({
    id: id('10'),
    principalType: 'USER',
    principalId: id('1'),
    scope: { scopeType: 'organization', organizationId: id('2') },
    roleId: 'owner',
    status: 'ACTIVE',
    revision: 1,
  });
  assert.equal(membership.accepted, true);
  if (membership.accepted)
    assert.equal(checkOwnerRemovalV1([membership.value], membership.value.id), 'LAST_OWNER');
});

test('[IAM-005] refresh rotation is single-use and reuse revokes the family', () => {
  const rotated = rotateRefreshFamilyV1({
    now: createdAt,
    presentedTokenId: id('20'),
    activeTokenId: id('20'),
    nextTokenId: id('21'),
    familyStatus: 'ACTIVE',
    tokenExpiresAt: '2026-01-01T00:10:00.000Z',
  });
  assert.deepEqual(rotated, {
    accepted: true,
    code: 'ROTATED',
    familyStatus: 'ACTIVE',
    nextTokenId: id('21'),
  });
  const reuse = rotateRefreshFamilyV1({
    now: createdAt,
    presentedTokenId: id('20'),
    activeTokenId: id('21'),
    nextTokenId: id('22'),
    familyStatus: 'ACTIVE',
    tokenExpiresAt: '2026-01-01T00:10:00.000Z',
  });
  assert.deepEqual(reuse, { accepted: false, code: 'REUSE_DETECTED', familyStatus: 'REVOKED' });
  const malformedExpiry = rotateRefreshFamilyV1({
    now: createdAt,
    presentedTokenId: id('20'),
    activeTokenId: id('20'),
    nextTokenId: id('21'),
    familyStatus: 'ACTIVE',
    tokenExpiresAt: 'not-a-timestamp',
  });
  assert.deepEqual(malformedExpiry, {
    accepted: false,
    code: 'EXPIRED',
    familyStatus: 'ACTIVE',
  });
});

test('[IAM-005, IAM-012] session access lifetime and fresh step-up are bounded', () => {
  const session = createSessionRecordV1({
    sessionId: id('30'),
    userId: id('1'),
    familyId: id('31'),
    issuedAt: createdAt,
    accessExpiresAt: '2026-01-01T00:15:00.000Z',
    inactivityExpiresAt: '2026-01-01T01:00:00.000Z',
    absoluteExpiresAt: '2026-01-31T00:00:00.000Z',
  });
  assert.equal(session.accepted, true);
  assert.equal(ACCESS_TOKEN_MAX_SECONDS_V1, 900);
  const assertion = {
    assertionId: id('32'),
    principalId: id('1'),
    issuedAt: createdAt,
    method: 'TOTP',
  };
  assert.equal(isFreshStepUpV1(assertion, id('1'), '2026-01-01T00:09:59.000Z'), true);
  assert.equal(isFreshStepUpV1(assertion, id('1'), '2026-01-01T00:10:01.000Z'), false);
});

test('[IAM-021] device activation and revocation are monotonic', () => {
  const device = {
    schemaVersion: 1,
    id: id('40'),
    userId: id('1'),
    organizationId: id('2'),
    platform: 'WINDOWS',
    publicKey: 'ed25519-public-key',
    keyAlgorithm: 'ED25519',
    status: 'PENDING',
    securityEpoch: 1,
    enrolledAt: createdAt,
    revision: 1,
  };
  const active = transitionDeviceIdentityV1(device, 'ACTIVATE', '2026-01-01T00:01:00.000Z');
  assert.equal(active.accepted, true);
  if (active.accepted) {
    assert.equal(active.value.status, 'ACTIVE');
    assert.equal(active.value.securityEpoch, 2);
    const revoked = transitionDeviceIdentityV1(active.value, 'REVOKE', '2026-01-01T00:02:00.000Z');
    assert.equal(revoked.accepted, true);
    if (revoked.accepted)
      assert.equal(
        transitionDeviceIdentityV1(revoked.value, 'ACTIVATE', '2026-01-01T00:03:00.000Z').accepted,
        false,
      );
  }
});

test('[IAM-007, IAM-021] enrollment challenges are bounded and single-use', () => {
  const challenge = createDeviceEnrollmentChallengeV1({
    challengeId: id('50'),
    userId: id('1'),
    organizationId: id('2'),
    platform: 'ANDROID',
    installationIdHash: 'a'.repeat(64),
    challengeDigest: 'b'.repeat(64),
    issuedAt: createdAt,
    expiresAt: '2026-01-01T00:05:00.000Z',
  });
  assert.equal(challenge.accepted, true);
  if (challenge.accepted) {
    const used = consumeDeviceEnrollmentChallengeV1(challenge.value, '2026-01-01T00:01:00.000Z');
    assert.equal(used.accepted, true);
    if (used.accepted) assert.equal(used.value.status, 'USED');
    assert.deepEqual(
      consumeDeviceEnrollmentChallengeV1(
        used.accepted ? used.value : challenge.value,
        '2026-01-01T00:02:00.000Z',
      ),
      { accepted: false, code: 'INVALID_STATE' },
    );
  }
});

test('[IAM-007, IAM-021] device enrollment validates key policy and rotation advances the epoch', () => {
  const device = createDeviceIdentityV1({
    id: id('51'),
    userId: id('1'),
    organizationId: id('2'),
    platform: 'WINDOWS',
    publicKey: 'ed25519-public-key',
    installationIdHash: 'c'.repeat(64),
    enrolledAt: createdAt,
  });
  assert.equal(device.accepted, true);
  if (device.accepted) {
    const rotated = rotateDeviceIdentityKeyV1(
      device.value,
      'new-ed25519-public-key',
      '2026-01-01T00:01:00.000Z',
    );
    assert.equal(rotated.accepted, true);
    if (rotated.accepted) {
      assert.equal(rotated.value.publicKey, 'new-ed25519-public-key');
      assert.equal(rotated.value.securityEpoch, 2);
      assert.equal(rotated.value.revision, 2);
    }
    assert.deepEqual(
      createDeviceIdentityV1({
        id: id('52'),
        userId: id('1'),
        organizationId: id('2'),
        platform: 'WINDOWS',
        publicKey: 'not allowed\nkey',
        enrolledAt: createdAt,
      }),
      { accepted: false, code: 'INVALID_TEXT' },
    );
  }
});
