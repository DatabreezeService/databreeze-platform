import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import type { RecoveryDigestPortV1 } from '../application/recovery-repository.port.js';
import type {
  RecoveryIdGeneratorV1,
  RecoveryTokenGeneratorV1,
} from '../application/recovery.service.js';

export type IamRecoveryDigestKeyV1 = string | Uint8Array;

function validKey(key: IamRecoveryDigestKeyV1): boolean {
  return (
    (typeof key === 'string' && Buffer.byteLength(key, 'utf8') >= 32) ||
    (key instanceof Uint8Array && key.byteLength >= 32)
  );
}

function boundedInput(value: string): string {
  if (value.length === 0 || value.length > 4096 || /\p{Cc}/u.test(value))
    throw new Error('IAM_RECOVERY_INPUT_INVALID');
  return value.normalize('NFC');
}

/** HMAC keeps recovery digests keyed and separate from invitation/session bearer digests. */
export class HmacSha256IamRecoveryDigestAdapter implements RecoveryDigestPortV1 {
  public constructor(private readonly key: IamRecoveryDigestKeyV1) {
    if (!validKey(key)) throw new Error('IAM_RECOVERY_KEY_INVALID');
  }

  private digest(domain: 'token' | 'email', value: string): string {
    return createHmac('sha256', this.key)
      .update(`databreeze:iam:recovery:${domain}:v1\u0000${boundedInput(value)}`, 'utf8')
      .digest('hex');
  }

  public digestToken(rawToken: string): string {
    return this.digest('token', rawToken);
  }

  public digestEmail(normalizedEmail: string): string {
    return this.digest('email', normalizedEmail);
  }
}

export const randomIamRecoveryIdV1: RecoveryIdGeneratorV1 = Object.freeze({
  next: () => randomUUID(),
});

export const randomIamRecoveryTokenV1: RecoveryTokenGeneratorV1 = Object.freeze({
  next: () => randomBytes(32).toString('base64url'),
});
