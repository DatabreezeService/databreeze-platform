import { createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';

import type { ServiceAccountSecretEnvelopePortV1 } from '../application/service-account.service.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyBytes(input: string | Uint8Array): Buffer {
  const key = typeof input === 'string' ? Buffer.from(input, 'base64url') : Buffer.from(input);
  if (key.length !== 32) throw new Error('IAM_SERVICE_ACCOUNT_ENVELOPE_KEY_INVALID');
  return key;
}

/** Encrypts replayable one-time secrets before an idempotency record reaches durable storage. */
export class AesGcmServiceAccountSecretEnvelopeAdapter
  implements ServiceAccountSecretEnvelopePortV1
{
  private readonly key: Buffer;

  public constructor(input: string | Uint8Array) {
    this.key = keyBytes(input);
  }

  public seal(secret: string): string {
    if (
      typeof secret !== 'string' ||
      secret.length === 0 ||
      secret.length > 512 ||
      /\p{Cc}/u.test(secret)
    )
      throw new Error('IAM_SERVICE_ACCOUNT_SECRET_INVALID');
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  public open(envelope: string): string | undefined {
    if (typeof envelope !== 'string') return undefined;
    const parts = envelope.split('.');
    if (parts.length !== 4) return undefined;
    const [version, ivEncoded, tagEncoded, ciphertextEncoded] = parts;
    if (version !== 'v1' || !ivEncoded || !tagEncoded || !ciphertextEncoded) return undefined;
    try {
      const iv = Buffer.from(ivEncoded, 'base64url');
      const tag = Buffer.from(tagEncoded, 'base64url');
      const ciphertext = Buffer.from(ciphertextEncoded, 'base64url');
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0)
        return undefined;
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        'utf8',
      );
      if (plaintext.length === 0 || plaintext.length > 512 || /\p{Cc}/u.test(plaintext))
        return undefined;
      return plaintext;
    } catch {
      return undefined;
    }
  }
}

/** Process-local fallback for tests and the private alpha when no durable key is configured. */
export function randomServiceAccountSecretEnvelopeAdapter(): AesGcmServiceAccountSecretEnvelopeAdapter {
  return new AesGcmServiceAccountSecretEnvelopeAdapter(randomBytes(32));
}
