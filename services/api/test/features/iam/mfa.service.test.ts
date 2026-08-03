import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecoveryCodeV1 } from '@databreeze/domain/mfa/v1';

import { InMemoryMfaRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-mfa-repository.adapter.js';
import { constantTimeRecoveryCodeMatchV1 } from '../../../src/features/iam/iam.module.js';
import { MfaService } from '../../../src/features/iam/application/mfa.service.js';

const userId = '00000000-0000-4000-8000-000000000001';
const factorId = '00000000-0000-4000-8000-000000000002';
const recoveryId = '00000000-0000-4000-8000-000000000003';
const at = '2026-01-01T00:00:00.000Z';

void test('[IAM-012, IAM-013, IAM-014] MFA enrollment and verification are revisioned', async () => {
  const repository = new InMemoryMfaRepositoryAdapter();
  const service = new MfaService(
    repository,
    {
      matches: (presented, stored) => presented === stored,
    },
    {
      verify: ({ proof }) => Promise.resolve(proof === '654321'),
    },
  );
  const enrolled = await service.enroll({
    id: factorId,
    userId,
    method: 'TOTP',
    secretReference: 'secret-ref:totp:1',
    enrolledAt: at,
  });
  assert.equal(enrolled.accepted, true);
  if (!enrolled.accepted) return;
  assert.equal(enrolled.value.factors[0]?.status, 'PENDING');
  const invalidProof = await service.verifyFactor(
    userId,
    factorId,
    '000000',
    '2026-01-01T00:01:00.000Z',
  );
  assert.deepEqual(invalidProof, { accepted: false, code: 'FACTOR_PROOF_INVALID' });
  const verified = await service.verifyFactor(
    userId,
    factorId,
    '654321',
    '2026-01-01T00:01:00.000Z',
  );
  assert.equal(verified.accepted, true);
  if (verified.accepted) assert.equal(verified.value.factors[0]?.status, 'ACTIVE');
  const secondVerify = await service.verifyFactor(
    userId,
    factorId,
    '654321',
    '2026-01-01T00:02:00.000Z',
  );
  assert.deepEqual(secondVerify, { accepted: false, code: 'INVALID_STATE' });
});

void test('[IAM-015, IAM-016] recovery code redemption is one-time and does not expose digests', async () => {
  const repository = new InMemoryMfaRepositoryAdapter();
  const code = createRecoveryCodeV1({ id: recoveryId, userId, digest: 'digest-1', createdAt: at });
  assert.equal(code.accepted, true);
  if (!code.accepted) return;
  await repository.saveState(userId as never, { factors: [], recoveryCodes: [code.value] });
  const service = new MfaService(repository, {
    matches: (presented, stored) => presented === stored,
  });
  const redeemed = await service.redeemRecovery(userId, 'digest-1', '2026-01-01T00:01:00.000Z');
  assert.equal(redeemed.accepted, true);
  if (!redeemed.accepted) return;
  assert.equal(redeemed.value.recoveryCodesRemaining, 0);
  assert.equal('digest' in redeemed.value, false);
  assert.deepEqual(await service.redeemRecovery(userId, 'digest-1', '2026-01-01T00:02:00.000Z'), {
    accepted: false,
    code: 'RECOVERY_CODE_USED',
  });
});

void test('[IAM-012] high-risk operations require a fresh step-up assertion', () => {
  const service = new MfaService(new InMemoryMfaRepositoryAdapter(), { matches: () => true });
  const assertion = {
    assertionId: '00000000-0000-4000-8000-000000000004' as never,
    principalId: userId as never,
    issuedAt: at as never,
    method: 'TOTP' as const,
  };
  assert.deepEqual(service.requireStepUp('HIGH', undefined, userId as never, at), {
    accepted: false,
    code: 'STEP_UP_REQUIRED',
  });
  assert.equal(
    service.requireStepUp('HIGH', assertion, userId as never, '2026-01-01T00:05:00.000Z').accepted,
    true,
  );
});

void test('[IAM-015] default recovery-code matching compares normalized bytes safely', () => {
  assert.equal(constantTimeRecoveryCodeMatchV1('digest-1', 'digest-1'), true);
  assert.equal(constantTimeRecoveryCodeMatchV1('digest-1', 'digest-2'), false);
  assert.equal(constantTimeRecoveryCodeMatchV1('digest-1', 'digest-10'), false);
});
