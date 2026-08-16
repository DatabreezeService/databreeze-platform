/* eslint-disable @typescript-eslint/require-await -- SMTP doubles implement an asynchronous port. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MailpitSmtpEmailVerificationDeliveryAdapter,
  NodeLoopbackSmtpSenderAdapter,
  renderSmtpMessageV1,
  type SmtpMessageV1,
} from '../../../src/features/iam/adapter/mailpit-smtp-email-verification-delivery.adapter.js';

void test('[IAM-022] Mailpit delivery emits one bounded localized SMTP message without correlation metadata', async () => {
  const messages: SmtpMessageV1[] = [];
  const delivery = new MailpitSmtpEmailVerificationDeliveryAdapter(
    { send: async (message) => void messages.push(message) },
    'verify@databreeze.local',
  );

  await delivery.deliver({
    email: 'owner@example.com',
    code: '042917',
    locale: 'vi-VN',
    correlationId: 'must-not-enter-email',
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.fromAddress, 'verify@databreeze.local');
  assert.deepEqual(messages[0]?.toAddresses, ['owner@example.com']);
  assert.equal(messages[0]?.subject, 'Mã xác minh DataBreeze');
  assert.match(messages[0]?.textBody ?? '', /042917/u);
  assert.match(messages[0]?.textBody ?? '', /10 phút/u);
  assert.match(messages[0]?.htmlBody ?? '', /042917/u);
  assert.match(messages[0]?.htmlBody ?? '', /XÁC MINH EMAIL/u);
  assert.equal(JSON.stringify(messages).includes('must-not-enter-email'), false);
});

void test('[IAM-022] SMTP rendering keeps the text fallback and branded HTML alternative', async () => {
  const message: SmtpMessageV1 = {
    fromAddress: 'verify@databreeze.local',
    toAddresses: ['owner@example.com'],
    subject: 'Your DataBreeze verification code',
    textBody: 'Your DataBreeze verification code is 042917.',
    htmlBody: '<!doctype html>\n<p>042917</p>',
  };

  const payload = renderSmtpMessageV1(message);

  assert.match(payload, /multipart\/alternative/u);
  assert.match(payload, /Content-Type: text\/plain; charset=UTF-8/u);
  assert.match(payload, /Content-Type: text\/html; charset=UTF-8/u);
  assert.match(payload, /Your DataBreeze verification code is 042917\./u);
  assert.match(payload, /<!doctype html>/u);
});

void test('[IAM-022] Mailpit delivery rejects header injection and hides provider details', async () => {
  assert.throws(
    () =>
      new MailpitSmtpEmailVerificationDeliveryAdapter(
        { send: async () => undefined },
        'verify@databreeze.local\r\nBcc: attacker@example.com',
      ),
    (error: unknown) =>
      error instanceof Error && error.message === 'IAM_LOCAL_EMAIL_CONFIGURATION_INVALID',
  );

  const delivery = new MailpitSmtpEmailVerificationDeliveryAdapter(
    {
      send: async () => {
        throw new Error('provider leaked owner@example.com and 123456');
      },
    },
    'verify@databreeze.local',
  );
  await assert.rejects(
    delivery.deliver({ email: 'owner@example.com', code: '123456', locale: 'en' }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'IAM_LOCAL_EMAIL_DELIVERY_UNAVAILABLE' &&
      !error.message.includes('owner@example.com') &&
      !error.message.includes('123456'),
  );
});

void test('[IAM-022] Node SMTP transport is loopback-only and bounded before any connection', async () => {
  for (const host of ['192.168.1.5', 'smtp.example.com', '127.0.0.1.example.com']) {
    assert.throws(
      () => new NodeLoopbackSmtpSenderAdapter({ host, port: 1025 }),
      (error: unknown) =>
        error instanceof Error && error.message === 'IAM_LOCAL_SMTP_CONFIGURATION_INVALID',
    );
  }
  assert.doesNotThrow(() => new NodeLoopbackSmtpSenderAdapter({ host: '127.0.0.1', port: 1025 }));
  assert.doesNotThrow(() => new NodeLoopbackSmtpSenderAdapter({ host: 'localhost', port: 1025 }));
  assert.doesNotThrow(() => new NodeLoopbackSmtpSenderAdapter({ host: 'mailpit', port: 1025 }));
  assert.throws(
    () => new NodeLoopbackSmtpSenderAdapter({ host: '127.0.0.1', port: 0 }),
    (error: unknown) =>
      error instanceof Error && error.message === 'IAM_LOCAL_SMTP_CONFIGURATION_INVALID',
  );
});
