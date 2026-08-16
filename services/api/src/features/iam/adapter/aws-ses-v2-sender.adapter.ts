import { SendEmailCommand, type SESv2Client } from '@aws-sdk/client-sesv2';

import type {
  SesEmailMessageV1,
  SesEmailSenderPortV1,
} from './aws-ses-email-verification-delivery.adapter.js';

export interface AwsSesV2SendClientPortV1 {
  send(command: SendEmailCommand): Promise<unknown>;
}

/** AWS SDK boundary kept outside the provider-neutral IAM delivery port. */
export class AwsSesV2SenderAdapter implements SesEmailSenderPortV1 {
  public constructor(private readonly client: AwsSesV2SendClientPortV1 | SESv2Client) {}

  public async sendEmail(message: SesEmailMessageV1): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: message.fromAddress,
        Destination: { ToAddresses: [message.toAddress] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: message.textBody, Charset: 'UTF-8' },
              Html: { Data: message.htmlBody, Charset: 'UTF-8' },
            },
          },
        },
      }),
    );
  }
}
