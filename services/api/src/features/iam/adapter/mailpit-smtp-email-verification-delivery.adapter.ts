import { createConnection, type Socket } from 'node:net';

import type { EmailVerificationDeliveryPortV1 } from '../application/email-verification-repository.port.js';
import {
  createEmailVerificationMessageContentV1,
  type EmailVerificationMessageContentV1,
} from './email-verification-message-content.js';

const EMAIL_ADDRESS_PATTERN_V1 = /^[^\s@]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/u;
const MAX_SMTP_MESSAGE_BYTES_V1 = 16 * 1024;

export interface SmtpMessageV1 {
  readonly fromAddress: string;
  readonly toAddresses: readonly [string];
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string;
}

export interface SmtpSenderPortV1 {
  send(message: SmtpMessageV1): Promise<void>;
}

export interface NodeLoopbackSmtpOptionsV1 {
  readonly host: string;
  readonly port: number;
  readonly timeoutMs?: number;
}

function localMailHost(value: string): boolean {
  return value === '127.0.0.1' || value === '::1' || value === 'localhost' || value === 'mailpit';
}

export function validSmtpAddressV1(value: string): boolean {
  return (
    value.length <= 320 &&
    !value.includes('\r') &&
    !value.includes('\n') &&
    EMAIL_ADDRESS_PATTERN_V1.test(value)
  );
}

const SMTP_BODY_LIMIT_BYTES_V1 = 12 * 1024;

function normalizeSmtpBody(value: string): string {
  return value.replace(/\r?\n/gu, '\r\n').replace(/^\./gmu, '..');
}

export function renderSmtpMessageV1(message: SmtpMessageV1): string {
  if (
    !validSmtpAddressV1(message.fromAddress) ||
    message.toAddresses.length !== 1 ||
    message.toAddresses[0] === undefined ||
    !validSmtpAddressV1(message.toAddresses[0]) ||
    message.subject.length < 1 ||
    message.subject.length > 200 ||
    message.subject.includes('\r') ||
    message.subject.includes('\n') ||
    message.textBody.length < 1 ||
    message.textBody.length > 4_096 ||
    message.htmlBody.length < 1 ||
    message.htmlBody.length > SMTP_BODY_LIMIT_BYTES_V1
  ) {
    throw new Error('IAM_LOCAL_SMTP_MESSAGE_INVALID');
  }
  const subject = Buffer.from(message.subject, 'utf8').toString('base64');
  const boundary = '=_DataBreeze_Email_Verification_v1';
  const payload = [
    `From: <${message.fromAddress}>`,
    `To: <${message.toAddresses[0]}>`,
    `Subject: =?UTF-8?B?${subject}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normalizeSmtpBody(message.textBody),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normalizeSmtpBody(message.htmlBody),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  if (Buffer.byteLength(payload, 'utf8') > MAX_SMTP_MESSAGE_BYTES_V1) {
    throw new Error('IAM_LOCAL_SMTP_MESSAGE_INVALID');
  }
  return payload;
}

export class SmtpReplyQueueV1 {
  private buffer = '';
  private readonly replies: number[] = [];
  private readonly waiters: Array<{
    readonly resolve: (code: number) => void;
    readonly reject: () => void;
  }> = [];

  public constructor(socket: Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.accept(chunk));
    socket.on('error', () => this.fail());
    socket.on('close', () => this.fail());
  }

  public next(): Promise<number> {
    const reply = this.replies.shift();
    if (reply !== undefined) return Promise.resolve(reply);
    return new Promise<number>((resolve, reject) => {
      this.waiters.push({ resolve, reject: () => reject(new Error('IAM_LOCAL_SMTP_UNAVAILABLE')) });
    });
  }

  private accept(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > 16_384) return this.fail();
    for (;;) {
      const separator = this.buffer.indexOf('\n');
      if (separator < 0) return;
      const line = this.buffer.slice(0, separator + 1).replace(/\r?\n$/u, '');
      this.buffer = this.buffer.slice(separator + 1);
      const match = /^(\d{3})([ -])/u.exec(line);
      if (!match || match[1] === undefined || match[2] === undefined) return this.fail();
      if (match[2] === ' ') this.push(Number(match[1]));
    }
  }

  private push(code: number): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(code);
    else this.replies.push(code);
  }

  private fail(): void {
    for (const waiter of this.waiters.splice(0)) waiter.reject();
  }
}

/** IAM-022: minimal loopback-only SMTP transport for the local Mailpit service. */
export class NodeLoopbackSmtpSenderAdapter implements SmtpSenderPortV1 {
  private readonly timeoutMs: number;

  public constructor(private readonly options: NodeLoopbackSmtpOptionsV1) {
    this.timeoutMs = options.timeoutMs ?? 3_000;
    if (
      !localMailHost(options.host) ||
      !Number.isSafeInteger(options.port) ||
      options.port < 1 ||
      options.port > 65_535 ||
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs < 500 ||
      this.timeoutMs > 10_000
    ) {
      throw new Error('IAM_LOCAL_SMTP_CONFIGURATION_INVALID');
    }
  }

  public async send(message: SmtpMessageV1): Promise<void> {
    const payload = renderSmtpMessageV1(message);
    const socket = createConnection({ host: this.options.host, port: this.options.port });
    const replies = new SmtpReplyQueueV1(socket);
    socket.setTimeout(this.timeoutMs, () => socket.destroy());
    const expect = async (expected: readonly number[]): Promise<void> => {
      const code = await replies.next();
      if (!expected.includes(code)) throw new Error('IAM_LOCAL_SMTP_UNAVAILABLE');
    };
    const command = async (value: string, expected: readonly number[]): Promise<void> => {
      if (!socket.write(`${value}\r\n`, 'utf8')) {
        await new Promise<void>((resolve) => socket.once('drain', resolve));
      }
      await expect(expected);
    };
    try {
      await expect([220]);
      await command('EHLO localhost', [250]);
      await command(`MAIL FROM:<${message.fromAddress}>`, [250]);
      await command(`RCPT TO:<${message.toAddresses[0]}>`, [250, 251]);
      await command('DATA', [354]);
      await command(`${payload}\r\n.`, [250]);
      await command('QUIT', [221]);
    } catch {
      throw new Error('IAM_LOCAL_SMTP_UNAVAILABLE');
    } finally {
      socket.destroy();
    }
  }
}

/** IAM-022: local OTP delivery uses Mailpit without leaking correlation metadata. */
export class MailpitSmtpEmailVerificationDeliveryAdapter
  implements EmailVerificationDeliveryPortV1
{
  public constructor(
    private readonly sender: SmtpSenderPortV1,
    private readonly fromAddress: string,
  ) {
    if (!validSmtpAddressV1(fromAddress)) throw new Error('IAM_LOCAL_EMAIL_CONFIGURATION_INVALID');
  }

  public async deliver(input: {
    readonly email: string;
    readonly code: string;
    readonly locale: string;
    readonly correlationId?: string;
  }): Promise<void> {
    const messageContent: EmailVerificationMessageContentV1 | undefined =
      createEmailVerificationMessageContentV1(input.locale, input.code);
    if (!validSmtpAddressV1(input.email) || !/^\d{6}$/u.test(input.code) || !messageContent) {
      throw new Error('IAM_LOCAL_EMAIL_INPUT_INVALID');
    }
    try {
      await this.sender.send(
        Object.freeze({
          fromAddress: this.fromAddress,
          toAddresses: Object.freeze([input.email] as const),
          ...messageContent,
        }),
      );
    } catch {
      throw new Error('IAM_LOCAL_EMAIL_DELIVERY_UNAVAILABLE');
    }
  }
}
