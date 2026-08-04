import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import type { IamInvitationDigestPortV1 } from '../application/invitation.service.js';

export type IamInvitationDigestKeyV1 = string | Uint8Array;

function validKey(key: IamInvitationDigestKeyV1): boolean {
  return (
    (typeof key === 'string' && Buffer.byteLength(key, 'utf8') >= 32) ||
    (key instanceof Uint8Array && key.byteLength >= 32)
  );
}

function boundedInput(value: string): string {
  if (value.length === 0 || value.length > 4096 || /\p{Cc}/u.test(value))
    throw new Error('IAM_INVITATION_INPUT_INVALID');
  return value.normalize('NFC');
}

/** HMAC keeps invitation digests keyed while domain-separating bearer and recipient material. */
export class HmacSha256IamInvitationDigestAdapter implements IamInvitationDigestPortV1 {
  public constructor(private readonly key: IamInvitationDigestKeyV1) {
    if (!validKey(key)) throw new Error('IAM_INVITATION_KEY_INVALID');
  }

  private digest(domain: 'token' | 'email', value: string): string {
    return createHmac('sha256', this.key)
      .update(`databreeze:iam:invitation:${domain}:v1\u0000${boundedInput(value)}`, 'utf8')
      .digest('hex');
  }

  public digestToken(rawToken: string): string {
    return this.digest('token', rawToken);
  }

  public digestEmail(normalizedEmail: string): string {
    return this.digest('email', normalizedEmail);
  }
}

export function randomIamInvitationIdV1(): string {
  return randomUUID();
}

export function randomIamInvitationTokenV1(): string {
  return randomBytes(32).toString('base64url');
}
