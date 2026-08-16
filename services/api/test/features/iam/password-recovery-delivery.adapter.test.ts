import assert from 'node:assert/strict';
import test from 'node:test';

import { AwsSesPasswordRecoveryDeliveryAdapter } from '../../../src/features/iam/adapter/aws-ses-password-recovery-delivery.adapter.js';
import { SmtpPasswordRecoveryDeliveryAdapter } from '../../../src/features/iam/adapter/smtp-password-recovery-delivery.adapter.js';
import type { SesEmailMessageV1 } from '../../../src/features/iam/adapter/aws-ses-email-verification-delivery.adapter.js';
import type { SmtpMessageV1 } from '../../../src/features/iam/adapter/mailpit-smtp-email-verification-delivery.adapter.js';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

const challengeId = '00000000-0000-4000-8000-000000000001' as StableIdentifierV1;
const rawToken = 'r'.repeat(43);
const expiresAt = '2026-08-03T01:00:00.000Z';

void test('[IAM-015] SMTP recovery delivery sends a localized, origin-bound reset link without correlation metadata', async () => {
  const messages: SmtpMessageV1[] = [];
  const delivery = new SmtpPasswordRecoveryDeliveryAdapter(
    { send: async (message) => void messages.push(message) },
    'support@databreeze.local',
    'https://databreeze.tech',
  );

  await delivery.deliver({
    challengeId,
    recipientEmail: 'owner@example.com',
    rawToken,
    expiresAt,
    locale: 'en',
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.subject, 'Reset your DataBreeze password');
  assert.match(
    messages[0]?.textBody ?? '',
    /https:\/\/databreeze\.tech\/en\/reset-password\?token=/u,
  );
  assert.match(messages[0]?.htmlBody ?? '', /Create a new password/u);
  assert.match(
    messages[0]?.htmlBody ?? '',
    /https:\/\/databreeze\.tech\/en\/reset-password\?token=/u,
  );
  assert.match(messages[0]?.textBody ?? '', /60 minutes/u);
  assert.equal(JSON.stringify(messages).includes(challengeId), false);
});

void test('[IAM-015] local HMR recovery delivery permits only an explicit loopback HTTP origin', async () => {
  const messages: SmtpMessageV1[] = [];
  const delivery = new SmtpPasswordRecoveryDeliveryAdapter(
    { send: async (message) => void messages.push(message) },
    'support@databreeze.local',
    'http://127.0.0.1:5173',
    true,
  );

  await delivery.deliver({
    challengeId,
    recipientEmail: 'owner@example.com',
    rawToken,
    expiresAt,
    locale: 'vi-VN',
  });

  assert.equal(messages[0]?.subject, 'Đặt lại mật khẩu DataBreeze');
  assert.match(
    messages[0]?.textBody ?? '',
    /http:\/\/127\.0\.0\.1:5173\/vi-VN\/reset-password\?token=/u,
  );
});

void test('[IAM-015] recovery delivery rejects invalid origin, token, expiry, and locale before sending', async () => {
  const send = async () => {
    throw new Error('must not send');
  };
  const invalidOrigin = new SmtpPasswordRecoveryDeliveryAdapter(
    { send },
    'support@databreeze.local',
    'http://public.example.com',
    true,
  );
  const validOrigin = new SmtpPasswordRecoveryDeliveryAdapter(
    { send },
    'support@databreeze.local',
    'https://databreeze.tech',
  );

  await assert.rejects(
    invalidOrigin.deliver({
      challengeId,
      recipientEmail: 'owner@example.com',
      rawToken,
      expiresAt,
      locale: 'en',
    }),
    /IAM_LOCAL_EMAIL_INPUT_INVALID/u,
  );
  await assert.rejects(
    validOrigin.deliver({
      challengeId,
      recipientEmail: 'owner@example.com',
      rawToken: `${rawToken}!`,
      expiresAt,
      locale: 'en',
    }),
    /IAM_LOCAL_EMAIL_INPUT_INVALID/u,
  );
  await assert.rejects(
    validOrigin.deliver({
      challengeId,
      recipientEmail: 'owner@example.com',
      rawToken,
      expiresAt: 'not-a-timestamp',
      locale: 'en',
    }),
    /IAM_LOCAL_EMAIL_INPUT_INVALID/u,
  );
  await assert.rejects(
    validOrigin.deliver({
      challengeId,
      recipientEmail: 'owner@example.com',
      rawToken,
      expiresAt,
      locale: 'fr' as never,
    }),
    /IAM_LOCAL_EMAIL_INPUT_INVALID/u,
  );
});

void test('[IAM-015] SES recovery delivery maps the same localized message boundary for production', async () => {
  const messages: SesEmailMessageV1[] = [];
  const delivery = new AwsSesPasswordRecoveryDeliveryAdapter(
    { sendEmail: async (message) => void messages.push(message) },
    'support@databreeze.tech',
    'https://databreeze.tech',
  );

  await delivery.deliver({
    challengeId,
    recipientEmail: 'owner@example.com',
    rawToken,
    expiresAt,
    locale: 'vi-VN',
  });

  assert.equal(messages[0]?.toAddress, 'owner@example.com');
  assert.equal(messages[0]?.subject, 'Đặt lại mật khẩu DataBreeze');
  assert.match(
    messages[0]?.htmlBody ?? '',
    /https:\/\/databreeze\.tech\/vi-VN\/reset-password\?token=/u,
  );
  assert.equal(JSON.stringify(messages).includes(challengeId), false);
});

void test('[IAM-015] SES recovery delivery normalizes provider failures without leaking message data', async () => {
  const delivery = new AwsSesPasswordRecoveryDeliveryAdapter(
    {
      sendEmail: async () => {
        throw new Error('provider body contained owner@example.com and secret-token');
      },
    },
    'support@databreeze.tech',
    'https://databreeze.tech',
  );

  await assert.rejects(
    delivery.deliver({
      challengeId,
      recipientEmail: 'owner@example.com',
      rawToken,
      expiresAt,
      locale: 'en',
    }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'IAM_EMAIL_DELIVERY_UNAVAILABLE' &&
      !error.message.includes('owner@example.com') &&
      !error.message.includes('secret-token'),
  );
});
