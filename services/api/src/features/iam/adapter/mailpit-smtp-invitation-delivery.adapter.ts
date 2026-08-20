import type { IamInvitationDeliveryPortV1 } from '../application/invitation.service.js';
import {
  validSmtpAddressV1,
  type SmtpSenderPortV1,
} from './mailpit-smtp-email-verification-delivery.adapter.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** IAM-010: local invitation delivery keeps the raw bearer inside SMTP only. */
export class MailpitSmtpInvitationDeliveryAdapter implements IamInvitationDeliveryPortV1 {
  public constructor(
    private readonly sender: SmtpSenderPortV1,
    private readonly fromAddress: string,
    private readonly webPublicUrl: string,
    allowInsecureLocalOrigin = false,
  ) {
    if (!validSmtpAddressV1(fromAddress)) throw new Error('IAM_LOCAL_EMAIL_CONFIGURATION_INVALID');
    let origin: URL;
    try {
      origin = new URL(webPublicUrl);
    } catch {
      throw new Error('IAM_LOCAL_INVITATION_URL_INVALID');
    }
    const insecureLoopbackAllowed =
      allowInsecureLocalOrigin &&
      origin.protocol === 'http:' &&
      (origin.hostname === '127.0.0.1' ||
        origin.hostname === 'localhost' ||
        origin.hostname === '[::1]');
    if (
      (origin.protocol !== 'https:' && !insecureLoopbackAllowed) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      throw new Error('IAM_LOCAL_INVITATION_URL_INVALID');
  }

  public async deliver(input: {
    readonly invitationId: string;
    readonly membershipId: string;
    readonly recipientEmail: string;
    readonly rawToken: string;
    readonly expiresAt: string;
  }): Promise<void> {
    if (
      !validSmtpAddressV1(input.recipientEmail) ||
      input.rawToken.length < 32 ||
      input.rawToken.length > 512
    )
      throw new Error('IAM_LOCAL_INVITATION_INPUT_INVALID');
    const link = `${this.webPublicUrl}/vi-VN/invitations/accept?token=${encodeURIComponent(input.rawToken)}`;
    const safeLink = escapeHtml(link);
    const expiry = escapeHtml(input.expiresAt);
    const textBody = [
      'Bạn được mời tham gia một không gian làm việc DataBreeze.',
      '',
      `Mở lời mời: ${link}`,
      `Lời mời hết hạn lúc: ${input.expiresAt}`,
      '',
      'Nếu bạn không mong đợi email này, hãy bỏ qua nó.',
    ].join('\n');
    const htmlBody = `<p>Bạn được mời tham gia một không gian làm việc DataBreeze.</p><p><a href="${safeLink}">Mở lời mời</a></p><p>Lời mời hết hạn lúc ${expiry}.</p><p>Nếu bạn không mong đợi email này, hãy bỏ qua nó.</p>`;
    try {
      await this.sender.send({
        fromAddress: this.fromAddress,
        toAddresses: [input.recipientEmail],
        subject: 'Lời mời tham gia không gian làm việc DataBreeze',
        textBody,
        htmlBody,
      });
    } catch {
      throw new Error('IAM_LOCAL_INVITATION_DELIVERY_UNAVAILABLE');
    }
  }
}
