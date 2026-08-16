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
import type {
  SesEmailMessageV1,
  SesEmailSenderPortV1,
} from './aws-ses-email-verification-delivery.adapter.js';

/** IAM-015: production password recovery through the provider-neutral SES sender boundary. */
export class AwsSesPasswordRecoveryDeliveryAdapter implements RecoveryDeliveryPortV1 {
  public constructor(
    private readonly sender: SesEmailSenderPortV1,
    private readonly fromAddress: string,
    private readonly webOrigin: string,
  ) {
    if (!validPasswordRecoveryEmailV1(fromAddress)) {
      throw new Error('IAM_EMAIL_DELIVERY_CONFIGURATION_INVALID');
    }
  }

  public async deliver(input: Parameters<RecoveryDeliveryPortV1['deliver']>[0]): Promise<void> {
    const resetUrl = createPasswordRecoveryUrlV1(this.webOrigin, input.locale, input.rawToken);
    const messageContent: PasswordRecoveryMessageContentV1 | undefined = resetUrl
      ? createPasswordRecoveryMessageContentV1(input.locale, resetUrl)
      : undefined;
    if (
      !validPasswordRecoveryEmailV1(input.recipientEmail) ||
      !validRecoveryExpiryV1(input.expiresAt) ||
      !resetUrl ||
      !messageContent
    ) {
      throw new Error('IAM_EMAIL_DELIVERY_INPUT_INVALID');
    }
    const message: SesEmailMessageV1 = Object.freeze({
      fromAddress: this.fromAddress,
      toAddress: input.recipientEmail,
      ...messageContent,
    });
    try {
      await this.sender.sendEmail(message);
    } catch {
      throw new Error('IAM_EMAIL_DELIVERY_UNAVAILABLE');
    }
  }
}
