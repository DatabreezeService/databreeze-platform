import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { EmailVerificationEnvelopePortV1 } from '../application/email-verification-repository.port.js';

const ENVELOPE_CONTEXT_V1 = Buffer.from('databreeze:iam:email-verification-envelope:v1', 'utf8');
const MAX_PLAINTEXT_BYTES_V1 = 32 * 1024;

function keyBytes(input: string | Uint8Array): Buffer {
  const candidate =
    typeof input === 'string' ? Buffer.from(input, 'base64url') : Buffer.from(input);
  if (candidate.byteLength !== 32)
    throw new Error('IAM_EMAIL_VERIFICATION_ENVELOPE_KEY_REQUIRED');
  return candidate;
}

/** IAM-022: authenticated encryption for pending credentials and idempotent session replay. */
export class Aes256GcmEmailVerificationEnvelopeAdapter
  implements EmailVerificationEnvelopePortV1
{
  private readonly key: Buffer;

  public constructor(key: string | Uint8Array) {
    this.key = keyBytes(key);
  }

  public seal(value: Readonly<Record<string, unknown>>): string {
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    if (plaintext.byteLength === 0 || plaintext.byteLength > MAX_PLAINTEXT_BYTES_V1)
      throw new Error('IAM_EMAIL_VERIFICATION_ENVELOPE_PAYLOAD_INVALID');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(ENVELOPE_CONTEXT_V1);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return ['v1', iv.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
  }

  public open(envelope: string): Readonly<Record<string, unknown>> | undefined {
    try {
      if (typeof envelope !== 'string' || envelope.length > MAX_PLAINTEXT_BYTES_V1 * 2)
        return undefined;
      const [version, ivEncoded, ciphertextEncoded, tagEncoded, extra] = envelope.split('.');
      if (version !== 'v1' || !ivEncoded || !ciphertextEncoded || !tagEncoded || extra) return undefined;
      const iv = Buffer.from(ivEncoded, 'base64url');
      const ciphertext = Buffer.from(ciphertextEncoded, 'base64url');
      const tag = Buffer.from(tagEncoded, 'base64url');
      if (iv.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength === 0 || ciphertext.byteLength > MAX_PLAINTEXT_BYTES_V1)
        return undefined;
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(ENVELOPE_CONTEXT_V1);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Readonly<Record<string, unknown>>)
        : undefined;
    } catch {
      return undefined;
    }
  }
}
