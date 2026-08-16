import type { EmailVerificationDeliveryPortV1 } from '../application/email-verification-repository.port.js';
import {
  createEmailVerificationMessageContentV1,
  type EmailVerificationMessageContentV1,
} from './email-verification-message-content.js';

const EMAIL_ADDRESS_PATTERN_V1 = /^[^\s@]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/u;

export interface SesEmailMessageV1 {
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string;
}

/** Provider-neutral transactional email boundary implemented by the AWS SES runtime adapter. */
export interface SesEmailSenderPortV1 {
  sendEmail(message: SesEmailMessageV1): Promise<void>;
}

function validAddress(value: string): boolean {
  return (
    value.length <= 320 &&
    [...value].every((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
    }) &&
    EMAIL_ADDRESS_PATTERN_V1.test(value)
  );
}

/** IAM-022: localized OTP delivery with no account or correlation metadata. */
export class AwsSesEmailVerificationDeliveryAdapter implements EmailVerificationDeliveryPortV1 {
  public constructor(
    private readonly sender: SesEmailSenderPortV1,
    private readonly fromAddress: string,
  ) {
    if (!validAddress(fromAddress)) {
      throw new Error('IAM_EMAIL_DELIVERY_CONFIGURATION_INVALID');
    }
  }

  public async deliver(input: {
    readonly email: string;
    readonly code: string;
    readonly locale: string;
    readonly correlationId?: string;
  }): Promise<void> {
    const messageContent: EmailVerificationMessageContentV1 | undefined =
      createEmailVerificationMessageContentV1(input.locale, input.code);
    if (!validAddress(input.email) || !/^\d{6}$/u.test(input.code) || !messageContent) {
      throw new Error('IAM_EMAIL_DELIVERY_INPUT_INVALID');
    }
    try {
      await this.sender.sendEmail(
        Object.freeze({
          fromAddress: this.fromAddress,
          toAddress: input.email,
          ...messageContent,
        }),
      );
    } catch {
      throw new Error('IAM_EMAIL_DELIVERY_UNAVAILABLE');
    }
  }
}
