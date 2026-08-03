import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RECOVERY_CHALLENGE_MAX_SECONDS_V1,
  consumeRecoveryChallengeV1,
  createRecoveryChallengeV1,
  revokeRecoveryChallengeV1,
} from '@databreeze/domain/recovery/v1';

const ids = {
  challenge: '00000000-0000-4000-8000-000000000001',
  user: '00000000-0000-4000-8000-000000000002',
};
const issuedAt = '2026-08-03T00:00:00.000Z';
const expiresAt = new Date(
  Date.parse(issuedAt) + RECOVERY_CHALLENGE_MAX_SECONDS_V1 * 1_000,
).toISOString();

function input(overrides = {}) {
  return {
    id: ids.challenge,
    userId: ids.user,
    tokenDigest: 'a'.repeat(64),
    emailDigest: 'b'.repeat(64),
    issuedAt,
    expiresAt,
    ...overrides,
  };
}

void test('[IAM-015] recovery challenge stores only bounded digests and expires within one hour', () => {
  const created = createRecoveryChallengeV1(input());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.value.status, 'ACTIVE');
  assert.equal('rawToken' in created.value, false);
  assert.equal(created.value.revision, 1);
  assert.deepEqual(createRecoveryChallengeV1(input({ tokenDigest: 'raw-token' })), {
    accepted: false,
    code: 'INVALID_DIGEST',
  });
  assert.deepEqual(
    createRecoveryChallengeV1({
      ...input(),
      expiresAt: new Date(
        Date.parse(issuedAt) + (RECOVERY_CHALLENGE_MAX_SECONDS_V1 + 1) * 1_000,
      ).toISOString(),
    }),
    { accepted: false, code: 'INVALID_LIFETIME' },
  );
});

void test('[IAM-015] recovery challenge consumption is single-use, time-bounded, and revisioned', () => {
  const created = createRecoveryChallengeV1(input());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const consumed = consumeRecoveryChallengeV1(created.value, '2026-08-03T00:30:00.000Z');
  assert.equal(consumed.accepted, true);
  if (!consumed.accepted) return;
  assert.equal(consumed.value.status, 'CONSUMED');
  assert.equal(consumed.value.revision, 2);
  assert.deepEqual(consumeRecoveryChallengeV1(consumed.value, '2026-08-03T00:31:00.000Z'), {
    accepted: false,
    code: 'ALREADY_TERMINAL',
  });
  assert.deepEqual(consumeRecoveryChallengeV1(created.value, expiresAt), {
    accepted: false,
    code: 'EXPIRED',
  });
});

void test('[IAM-015] recovery challenge revocation is terminal and does not return bearer data', () => {
  const created = createRecoveryChallengeV1(input());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const revoked = revokeRecoveryChallengeV1(created.value, '2026-08-03T00:01:00.000Z');
  assert.equal(revoked.accepted, true);
  if (!revoked.accepted) return;
  assert.equal(revoked.value.status, 'REVOKED');
  assert.equal(revoked.value.revokedAt, '2026-08-03T00:01:00.000Z');
  assert.deepEqual(revokeRecoveryChallengeV1(revoked.value, '2026-08-03T00:02:00.000Z'), {
    accepted: false,
    code: 'ALREADY_TERMINAL',
  });
});
