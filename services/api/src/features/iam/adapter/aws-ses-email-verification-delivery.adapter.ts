import type { EmailVerificationDeliveryPortV1 } from '../application/email-verification-repository.port.js';

const EMAIL_ADDRESS_PATTERN_V1 = /^[^\s@]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/u;

export interface SesEmailMessageV1 {
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly subject: string;
  readonly textBody: string;
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

function content(
  locale: string,
  code: string,
): Pick<SesEmailMessageV1, 'subject' | 'textBody'> | undefined {
  if (locale === 'vi-VN') {
    return Object.freeze({
      subject: 'Mã xác minh DataBreeze',
      textBody: `Mã xác minh DataBreeze của bạn là ${code}. Mã này hết hạn sau 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.`,
    });
  }
  if (locale === 'en') {
    return Object.freeze({
      subject: 'Your DataBreeze verification code',
      textBody: `Your DataBreeze verification code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
    });
  }
  return undefined;
}

/** IAM-022: minimal localized OTP delivery with no account or correlation metadata. */
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
    const messageContent = content(input.locale, input.code);
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
