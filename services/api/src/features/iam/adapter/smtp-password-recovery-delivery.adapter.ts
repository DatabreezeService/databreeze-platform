import type { RecoveryDeliveryPortV1 } from '../application/recovery-repository.port.js';
import {
  createPasswordRecoveryUrlV1,
  validPasswordRecoveryEmailV1,
  validRecoveryExpiryV1,
} from './password-recovery-delivery.utils.js';
import {
  createPasswordRecoveryMessageContentV1,
  type PasswordRecoveryMessageContentV1,
} from './password-recovery-message-content.js';
import {
  validSmtpAddressV1,
  type SmtpMessageV1,
  type SmtpSenderPortV1,
} from './mailpit-smtp-email-verification-delivery.adapter.js';

/** IAM-015/IAM-022: sends a single-use reset link through the configured local SMTP provider. */
export class SmtpPasswordRecoveryDeliveryAdapter implements RecoveryDeliveryPortV1 {
  public constructor(
    private readonly sender: SmtpSenderPortV1,
    private readonly fromAddress: string,
    private readonly webOrigin: string,
    private readonly allowLoopbackHttp = false,
  ) {
    if (!validSmtpAddressV1(fromAddress)) throw new Error('IAM_LOCAL_EMAIL_CONFIGURATION_INVALID');
  }

  public async deliver(input: Parameters<RecoveryDeliveryPortV1['deliver']>[0]): Promise<void> {
    const resetUrl = createPasswordRecoveryUrlV1(
      this.webOrigin,
      input.locale,
      input.rawToken,
      this.allowLoopbackHttp,
    );
    const messageContent: PasswordRecoveryMessageContentV1 | undefined = resetUrl
      ? createPasswordRecoveryMessageContentV1(input.locale, resetUrl)
      : undefined;
    if (
      !validPasswordRecoveryEmailV1(input.recipientEmail) ||
      !validRecoveryExpiryV1(input.expiresAt) ||
      !resetUrl ||
      !messageContent
    ) {
      throw new Error('IAM_LOCAL_EMAIL_INPUT_INVALID');
    }
    const message: SmtpMessageV1 = Object.freeze({
      fromAddress: this.fromAddress,
      toAddresses: Object.freeze([input.recipientEmail] as const),
      ...messageContent,
    });
    try {
      await this.sender.send(message);
    } catch {
      throw new Error('IAM_LOCAL_EMAIL_DELIVERY_UNAVAILABLE');
    }
  }
}
