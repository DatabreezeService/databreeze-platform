import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HmacSha256EmailVerificationDigestAdapter,
  InMemoryEmailVerificationRepositoryAdapter,
} from '../../../src/features/iam/adapter/in-memory-email-verification-repository.adapter.js';
import { EmailVerificationService } from '../../../src/features/iam/application/email-verification.service.js';

void test('[IAM-022] request returns generic accepted shape for known and unknown email', async () => {
  const delivered: string[] = [];
  const repository = new InMemoryEmailVerificationRepositoryAdapter();
  const digest = new HmacSha256EmailVerificationDigestAdapter('test-email-verification-key');
  let now = new Date('2026-01-01T00:00:00.000Z');
  const service = new EmailVerificationService({
    repository,
    digest,
    delivery: {
      async deliver(input) {
        delivered.push(input.code);
      },
    },
    clock: { now: () => new Date(now) },
    codes: { next: () => '123456' },
    ids: { next: () => '00000000-0000-4000-8000-000000000201' },
  });
  const first = await service.requestEmailVerification({
    email: 'owner@example.com',
    locale: 'vi-VN',
  });
  assert.deepEqual(first, { accepted: true, value: { requested: true } });
  const second = await service.requestEmailVerification({
    email: 'missing@example.com',
    locale: 'en',
  });
  assert.deepEqual(second, { accepted: true, value: { requested: true } });
  assert.equal(delivered.length >= 1, true);
  for (const challenge of repository.allChallenges()) {
    assert.doesNotMatch(JSON.stringify(challenge), /123456/u);
  }
});

void test('[IAM-022] six-digit code only; seventh digit rejected', async () => {
  const repository = new InMemoryEmailVerificationRepositoryAdapter();
  const digest = new HmacSha256EmailVerificationDigestAdapter('test-email-verification-key');
  const service = new EmailVerificationService({
    repository,
    digest,
    delivery: { async deliver() {} },
    clock: { now: () => new Date('2026-01-01T00:00:00.000Z') },
    codes: { next: () => '123456' },
    ids: { next: () => '00000000-0000-4000-8000-000000000202' },
  });
  await service.requestEmailVerification({ email: 'owner@example.com' });
  const bad = await service.verifyEmailRegistration({
    challengeId: '00000000-0000-4000-8000-000000000202',
    code: '1234567',
    email: 'owner@example.com',
    idempotencyKey: 'idem-1',
  });
  assert.deepEqual(bad, { accepted: false, code: 'INVALID_INPUT' });
});

void test('[IAM-022] expiry, attempts, resend, and activation idempotency', async () => {
  const repository = new InMemoryEmailVerificationRepositoryAdapter();
  const digest = new HmacSha256EmailVerificationDigestAdapter('test-email-verification-key');
  let now = new Date('2026-01-01T00:00:00.000Z');
  const service = new EmailVerificationService({
    repository,
    digest,
    delivery: { async deliver() {} },
    clock: { now: () => new Date(now) },
    codes: { next: () => '654321' },
    ids: { next: () => '00000000-0000-4000-8000-000000000203' },
  });
  await service.requestEmailVerification({ email: 'owner@example.com' });
  now = new Date('2026-01-01T00:00:30.000Z');
  const tooSoon = await service.requestEmailVerification({ email: 'owner@example.com' });
  assert.deepEqual(tooSoon, { accepted: true, value: { requested: true } });
  assert.equal(repository.allChallenges().filter((c) => c.status === 'ACTIVE').length, 1);

  for (let i = 0; i < 4; i += 1) {
    const failed = await service.verifyEmailRegistration({
      challengeId: '00000000-0000-4000-8000-000000000203',
      code: '000000',
      email: 'owner@example.com',
      idempotencyKey: `bad-attempt-${i}`,
    });
    assert.equal(failed.accepted, false);
  }
  const locked = await service.verifyEmailRegistration({
    challengeId: '00000000-0000-4000-8000-000000000203',
    code: '000000',
    email: 'owner@example.com',
    idempotencyKey: 'bad-attempt-final',
  });
  assert.deepEqual(locked, { accepted: false, code: 'LOCKED' });

  now = new Date('2026-01-01T00:02:00.000Z');
  const serviceFresh = new EmailVerificationService({
    repository,
    digest,
    delivery: { async deliver() {} },
    clock: { now: () => new Date(now) },
    codes: { next: () => '111111' },
    ids: { next: () => '00000000-0000-4000-8000-000000000204' },
  });
  await serviceFresh.requestEmailVerification({ email: 'fresh@example.com' });
  now = new Date('2026-01-01T00:13:00.000Z');
  const expired = await serviceFresh.verifyEmailRegistration({
    challengeId: '00000000-0000-4000-8000-000000000204',
    code: '111111',
    email: 'fresh@example.com',
    idempotencyKey: 'idem-fresh',
  });
  assert.deepEqual(expired, { accepted: false, code: 'EXPIRED' });

  now = new Date('2026-01-01T01:00:00.000Z');
  const serviceOk = new EmailVerificationService({
    repository,
    digest,
    delivery: { async deliver() {} },
    clock: { now: () => new Date(now) },
    codes: { next: () => '222222' },
    ids: { next: () => '00000000-0000-4000-8000-000000000205' },
  });
  await serviceOk.requestEmailVerification({ email: 'ok@example.com' });
  const first = await serviceOk.verifyEmailRegistration({
    challengeId: '00000000-0000-4000-8000-000000000205',
    code: '222222',
    email: 'ok@example.com',
    idempotencyKey: 'idem-ok-activation',
  });
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.value.alreadyCompleted, false);
  const second = await serviceOk.verifyEmailRegistration({
    challengeId: '00000000-0000-4000-8000-000000000205',
    code: '222222',
    email: 'ok@example.com',
    idempotencyKey: 'idem-ok-activation',
  });
  assert.equal(second.accepted, true);
  if (!second.accepted) return;
  assert.equal(second.value.alreadyCompleted, true);
});
