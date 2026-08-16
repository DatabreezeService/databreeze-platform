/* eslint-disable @typescript-eslint/require-await -- SMTP doubles implement an async port. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GmailSmtpEmailVerificationDeliveryAdapter,
  GmailSmtpSenderAdapter,
  type SmtpMessageV1,
} from '../../../src/features/iam/adapter/gmail-smtp-email-verification-delivery.adapter.js';

const valid = {
  host: 'smtp.gmail.com',
  port: 465,
  username: 'owner@gmail.com',
  appPassword: 'abcdefghijklmnop',
} as const;

void test('[IAM-022] Gmail SMTP configuration accepts only smtp.gmail.com implicit TLS and an App Password', () => {
  assert.doesNotThrow(() => new GmailSmtpSenderAdapter(valid));
  for (const candidate of [
    { ...valid, host: 'smtp.example.com' },
    { ...valid, port: 587 },
    { ...valid, appPassword: 'normal-password' },
    { ...valid, username: 'owner@' },
  ]) {
    assert.throws(
      () => new GmailSmtpSenderAdapter(candidate),
      (error: unknown) =>
        error instanceof Error && error.message === 'IAM_GMAIL_SMTP_CONFIGURATION_INVALID',
    );
  }
});

void test('[IAM-022] Gmail delivery uses the authenticated Gmail identity as the sender', async () => {
  const messages: SmtpMessageV1[] = [];
  const delivery = new GmailSmtpEmailVerificationDeliveryAdapter(
    {
      send: async (message) => void messages.push(message),
    },
    valid.username,
  );

  await delivery.deliver({ email: 'owner@example.com', code: '042917', locale: 'en' });

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.fromAddress, valid.username);
  assert.deepEqual(messages[0]?.toAddresses, ['owner@example.com']);
  assert.equal(messages[0]?.subject, 'Your DataBreeze verification code');
  assert.match(messages[0]?.textBody ?? '', /042917/u);
  assert.match(messages[0]?.htmlBody ?? '', /042917/u);
  assert.match(messages[0]?.htmlBody ?? '', /Verify your email/u);
});

void test('[IAM-022] Gmail delivery hides SMTP provider details', async () => {
  const delivery = new GmailSmtpEmailVerificationDeliveryAdapter(
    {
      send: async () => {
        throw new Error('smtp leaked password and recipient');
      },
    },
    valid.username,
  );

  await assert.rejects(
    delivery.deliver({ email: 'owner@example.com', code: '123456', locale: 'en' }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'IAM_GMAIL_EMAIL_DELIVERY_UNAVAILABLE' &&
      !error.message.includes('password') &&
      !error.message.includes('recipient'),
  );
});
