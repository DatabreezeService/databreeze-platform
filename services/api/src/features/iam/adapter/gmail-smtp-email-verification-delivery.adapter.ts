import { connect as connectTls, type TLSSocket } from 'node:tls';

import type { EmailVerificationDeliveryPortV1 } from '../application/email-verification-repository.port.js';
import {
  MailpitSmtpEmailVerificationDeliveryAdapter,
  SmtpReplyQueueV1,
  type SmtpMessageV1,
  type SmtpSenderPortV1,
  renderSmtpMessageV1,
  validSmtpAddressV1,
} from './mailpit-smtp-email-verification-delivery.adapter.js';

export type { SmtpMessageV1 } from './mailpit-smtp-email-verification-delivery.adapter.js';

const GMAIL_SMTP_HOST = 'smtp.gmail.com';
const GMAIL_SMTP_PORT = 465;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface GmailSmtpSenderOptionsV1 {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly appPassword: string;
  readonly timeoutMs?: number;
}

export interface GmailSmtpSenderDependenciesV1 {
  readonly connect?: (options: {
    readonly host: string;
    readonly port: number;
    readonly servername: string;
    readonly minVersion: 'TLSv1.2';
    readonly rejectUnauthorized: true;
  }) => TLSSocket;
}

function normalizeAppPassword(value: string): string {
  return value.replace(/\s/gu, '');
}

function validateGmailOptions(options: GmailSmtpSenderOptionsV1): string {
  const appPassword = normalizeAppPassword(options.appPassword);
  if (
    options.host !== GMAIL_SMTP_HOST ||
    options.port !== GMAIL_SMTP_PORT ||
    !validSmtpAddressV1(options.username) ||
    !/^[A-Za-z0-9]{16}$/u.test(appPassword) ||
    (options.timeoutMs !== undefined &&
      (!Number.isSafeInteger(options.timeoutMs) ||
        options.timeoutMs < 1_000 ||
        options.timeoutMs > 60_000))
  ) {
    throw new Error('IAM_GMAIL_SMTP_CONFIGURATION_INVALID');
  }
  return appPassword;
}

/** IAM-022: Gmail submission over certificate-validated implicit TLS. */
export class GmailSmtpSenderAdapter implements SmtpSenderPortV1 {
  private readonly appPassword: string;
  private readonly timeoutMs: number;
  private readonly connect: NonNullable<GmailSmtpSenderDependenciesV1['connect']>;

  public constructor(
    private readonly options: GmailSmtpSenderOptionsV1,
    dependencies: GmailSmtpSenderDependenciesV1 = {},
  ) {
    this.appPassword = validateGmailOptions(options);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.connect =
      dependencies.connect ??
      ((connectionOptions) =>
        connectTls({
          host: connectionOptions.host,
          port: connectionOptions.port,
          servername: connectionOptions.servername,
          minVersion: connectionOptions.minVersion,
          rejectUnauthorized: connectionOptions.rejectUnauthorized,
        }));
  }

  public async send(message: SmtpMessageV1): Promise<void> {
    if (message.fromAddress.toLowerCase() !== this.options.username.toLowerCase()) {
      throw new Error('IAM_GMAIL_SMTP_SENDER_MISMATCH');
    }
    const payload = renderSmtpMessageV1(message);
    const socket = this.connect({
      host: this.options.host,
      port: this.options.port,
      servername: this.options.host,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    });
    const replies = new SmtpReplyQueueV1(socket);
    socket.setTimeout(this.timeoutMs, () => socket.destroy());
    const expect = async (expected: readonly number[]): Promise<void> => {
      const code = await replies.next();
      if (!expected.includes(code)) throw new Error('IAM_GMAIL_SMTP_UNAVAILABLE');
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
      await command('AUTH LOGIN', [334]);
      await command(Buffer.from(this.options.username, 'utf8').toString('base64'), [334]);
      await command(Buffer.from(this.appPassword, 'utf8').toString('base64'), [235]);
      await command(`MAIL FROM:<${message.fromAddress}>`, [250]);
      await command(`RCPT TO:<${message.toAddresses[0]}>`, [250, 251]);
      await command('DATA', [354]);
      await command(`${payload}\r\n.`, [250]);
      await command('QUIT', [221]);
    } catch {
      throw new Error('IAM_GMAIL_SMTP_UNAVAILABLE');
    } finally {
      socket.destroy();
    }
  }
}

/** IAM-022: Gmail-backed OTP delivery with the same localized content as Mailpit. */
export class GmailSmtpEmailVerificationDeliveryAdapter implements EmailVerificationDeliveryPortV1 {
  private readonly delegate: MailpitSmtpEmailVerificationDeliveryAdapter;

  public constructor(sender: SmtpSenderPortV1, fromAddress: string) {
    if (!validSmtpAddressV1(fromAddress)) {
      throw new Error('IAM_GMAIL_SMTP_CONFIGURATION_INVALID');
    }
    this.delegate = new MailpitSmtpEmailVerificationDeliveryAdapter(sender, fromAddress);
  }

  public async deliver(input: {
    readonly email: string;
    readonly code: string;
    readonly locale: string;
    readonly correlationId?: string;
  }): Promise<void> {
    try {
      await this.delegate.deliver(input);
    } catch (error) {
      if (error instanceof Error && error.message === 'IAM_LOCAL_EMAIL_INPUT_INVALID') {
        throw new Error('IAM_GMAIL_EMAIL_INPUT_INVALID');
      }
      throw new Error('IAM_GMAIL_EMAIL_DELIVERY_UNAVAILABLE');
    }
  }
}
