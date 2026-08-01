import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMfaFactorV1,
  createRecoveryCodeV1,
  hasActiveMfaFactorV1,
  redeemRecoveryCodeV1,
  requiresStepUpV1,
  transitionMfaFactorV1,
} from '../src/mfa/v1.ts';

const id = (tail) => `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const createdAt = '2026-01-01T00:00:00.000Z';

test('[IAM-012, IAM-013] MFA factors transition only from pending to active, then revoke', () => {
  const created = createMfaFactorV1({
    id: id('1'),
    userId: id('2'),
    method: 'TOTP',
    secretReference: 'vault://iam/mfa/1',
    enrolledAt: createdAt,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const verified = transitionMfaFactorV1(created.value, 'VERIFY', '2026-01-01T00:01:00.000Z');
  assert.equal(verified.accepted, true);
  if (!verified.accepted) return;
  assert.deepEqual(
    hasActiveMfaFactorV1({ factors: [verified.value], recoveryCodes: [] }, id('2')),
    {
      accepted: true,
      value: true,
    },
  );
  const revoked = transitionMfaFactorV1(verified.value, 'REVOKE', '2026-01-01T00:02:00.000Z');
  assert.equal(revoked.accepted, true);
  if (revoked.accepted) assert.equal(revoked.value.status, 'REVOKED');
});

test('[IAM-014, IAM-015] recovery codes are one-time and never return the presented value', () => {
  const code = createRecoveryCodeV1({
    id: id('10'),
    userId: id('2'),
    digest: 'digest:recovery-1',
    createdAt,
  });
  assert.equal(code.accepted, true);
  if (!code.accepted) return;
  const state = { factors: [], recoveryCodes: [code.value] };
  const matcher = { matches: (presentedDigest, storedDigest) => presentedDigest === storedDigest };
  const redeemed = redeemRecoveryCodeV1(
    state,
    { userId: id('2'), presentedDigest: 'digest:recovery-1', at: '2026-01-01T00:03:00.000Z' },
    matcher,
  );
  assert.equal(redeemed.accepted, true);
  if (!redeemed.accepted) return;
  assert.equal(redeemed.value.recoveryCodes[0].status, 'USED');
  assert.deepEqual(
    redeemRecoveryCodeV1(
      redeemed.value,
      { userId: id('2'), presentedDigest: 'digest:recovery-1', at: '2026-01-01T00:04:00.000Z' },
      matcher,
    ),
    { accepted: false, code: 'RECOVERY_CODE_USED' },
  );
});

test('[IAM-012] high-risk operations require a fresh, principal-bound step-up assertion', () => {
  const assertion = {
    assertionId: id('20'),
    principalId: id('2'),
    issuedAt: createdAt,
    method: 'TOTP',
  };
  assert.deepEqual(requiresStepUpV1('NORMAL', undefined, id('2'), createdAt), {
    accepted: true,
    value: true,
  });
  assert.deepEqual(requiresStepUpV1('HIGH', undefined, id('2'), createdAt), {
    accepted: false,
    code: 'STEP_UP_REQUIRED',
  });
  assert.deepEqual(requiresStepUpV1('HIGH', assertion, id('2'), '2026-01-01T00:05:00.000Z'), {
    accepted: true,
    value: true,
  });
  assert.deepEqual(requiresStepUpV1('HIGH', assertion, id('3'), '2026-01-01T00:05:00.000Z'), {
    accepted: false,
    code: 'STEP_UP_REQUIRED',
  });
});
