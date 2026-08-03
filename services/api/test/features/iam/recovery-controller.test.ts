import assert from 'node:assert/strict';
import test from 'node:test';

import { RecoveryController } from '../../../src/features/iam/api/recovery.controller.js';
import { RecoveryProblemError } from '../../../src/features/iam/application/recovery-problem.error.js';
import type { RecoveryService } from '../../../src/features/iam/application/recovery.service.js';

void test('[IAM-015] recovery controller returns generic request and safe completion values', async () => {
  const controller = new RecoveryController({
    request: async () => ({ accepted: true as const, value: { requested: true as const } }),
    complete: async () => ({
      accepted: true as const,
      value: { userId: 'user-id' as never, mfaReenrollmentRequired: true as const },
    }),
  } as unknown as RecoveryService);
  assert.deepEqual(await controller.request({ email: 'user@example.com' }), { requested: true });
  assert.deepEqual(
    await controller.complete({
      token: 'a'.repeat(32),
      newPassword: 'correct horse battery staple',
    }),
    { userId: 'user-id', mfaReenrollmentRequired: true },
  );
});

void test('[IAM-015] recovery controller maps rejected and unavailable outcomes without account disclosure', async () => {
  const controller = new RecoveryController({
    request: async () => ({ accepted: false as const, code: 'INVALID_INPUT' as const }),
    complete: async () => ({ accepted: false as const, code: 'INVALID_TOKEN' as const }),
  } as unknown as RecoveryService);
  await assert.rejects(
    controller.request({ email: 'bad' }),
    (error: unknown) =>
      error instanceof RecoveryProblemError && error.code === 'RECOVERY_REQUEST_REJECTED',
  );
  await assert.rejects(
    controller.complete({ token: 'a'.repeat(32), newPassword: 'correct horse battery staple' }),
    (error: unknown) =>
      error instanceof RecoveryProblemError && error.code === 'RECOVERY_TOKEN_INVALID',
  );
  await assert.rejects(
    new RecoveryController(undefined).request({ email: 'user@example.com' }),
    (error: unknown) =>
      error instanceof RecoveryProblemError && error.code === 'RECOVERY_UNAVAILABLE',
  );
});
