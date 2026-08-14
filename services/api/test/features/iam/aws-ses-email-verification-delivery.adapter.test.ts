/* eslint-disable @typescript-eslint/require-await -- provider doubles implement asynchronous ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AwsSesEmailVerificationDeliveryAdapter,
  type SesEmailSenderPortV1,
} from '../../../src/features/iam/adapter/aws-ses-email-verification-delivery.adapter.js';
import { AwsSesV2SenderAdapter } from '../../../src/features/iam/adapter/aws-ses-v2-sender.adapter.js';

void test('[IAM-022] SES delivery emits one bounded localized transactional message without correlation metadata', async () => {
  const messages: Parameters<SesEmailSenderPortV1['sendEmail']>[0][] = [];
  const adapter = new AwsSesEmailVerificationDeliveryAdapter(
    { sendEmail: async (message) => void messages.push(message) },
    'verify@databreeze.example',
  );

  await adapter.deliver({
    email: 'customer@example.com',
    code: '042917',
    locale: 'vi-VN',
    correlationId: 'internal-correlation-id',
  });

  assert.deepEqual(messages, [
    {
      fromAddress: 'verify@databreeze.example',
      toAddress: 'customer@example.com',
      subject: 'Mã xác minh DataBreeze',
      textBody:
        'Mã xác minh DataBreeze của bạn là 042917. Mã này hết hạn sau 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.',
    },
  ]);
  assert.equal(JSON.stringify(messages).includes('internal-correlation-id'), false);
});

void test('[IAM-022] SES delivery supports the complete English locale', async () => {
  const messages: Parameters<SesEmailSenderPortV1['sendEmail']>[0][] = [];
  const adapter = new AwsSesEmailVerificationDeliveryAdapter(
    { sendEmail: async (message) => void messages.push(message) },
    'verify@databreeze.example',
  );

  await adapter.deliver({ email: 'customer@example.com', code: '123456', locale: 'en' });

  assert.equal(messages[0]?.subject, 'Your DataBreeze verification code');
  assert.equal(
    messages[0]?.textBody,
    'Your DataBreeze verification code is 123456. It expires in 10 minutes. If you did not request this code, ignore this email.',
  );
});

void test('[IAM-022] SES delivery fails closed with stable content-safe errors', async () => {
  assert.throws(
    () =>
      new AwsSesEmailVerificationDeliveryAdapter(
        { sendEmail: async () => undefined },
        'bad sender\r\nBcc: attacker@example.com',
      ),
    (error: unknown) =>
      error instanceof Error && error.message === 'IAM_EMAIL_DELIVERY_CONFIGURATION_INVALID',
  );

  const adapter = new AwsSesEmailVerificationDeliveryAdapter(
    {
      sendEmail: async () => {
        throw new Error('provider body contained customer@example.com and 123456');
      },
    },
    'verify@databreeze.example',
  );
  await assert.rejects(
    adapter.deliver({ email: 'customer@example.com', code: '123456', locale: 'en' }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'IAM_EMAIL_DELIVERY_UNAVAILABLE' &&
      !error.message.includes('customer@example.com') &&
      !error.message.includes('123456'),
  );
  await assert.rejects(
    adapter.deliver({ email: 'customer@example.com', code: '123456', locale: 'fr' }),
    (error: unknown) =>
      error instanceof Error && error.message === 'IAM_EMAIL_DELIVERY_INPUT_INVALID',
  );
});

void test('[IAM-022] AWS SES v2 sender maps only the bounded simple-message fields', async () => {
  const commands: unknown[] = [];
  const sender = new AwsSesV2SenderAdapter({
    send: async (command: unknown) => {
      commands.push(command);
      return {};
    },
  });

  await sender.sendEmail({
    fromAddress: 'verify@databreeze.example',
    toAddress: 'customer@example.com',
    subject: 'Your DataBreeze verification code',
    textBody: 'Your DataBreeze verification code is 123456.',
  });

  assert.equal(commands.length, 1);
  const command = commands[0] as { readonly input?: unknown };
  assert.deepEqual(command.input, {
    FromEmailAddress: 'verify@databreeze.example',
    Destination: { ToAddresses: ['customer@example.com'] },
    Content: {
      Simple: {
        Subject: { Data: 'Your DataBreeze verification code', Charset: 'UTF-8' },
        Body: {
          Text: {
            Data: 'Your DataBreeze verification code is 123456.',
            Charset: 'UTF-8',
          },
        },
      },
    },
  });
});
