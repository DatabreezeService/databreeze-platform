import { createHash, randomBytes } from 'node:crypto';

import type {
  ServiceAccountSecretIssueV1,
  ServiceAccountSecretIssuerV1,
} from '../application/service-account.service.js';

export type ServiceAccountRandomBytesV1 = (size: number) => Buffer;

/** Generates credentials only at issuance time; callers must persist the digest, never the secret. */
export class RandomServiceAccountSecretIssuer implements ServiceAccountSecretIssuerV1 {
  public constructor(
    private readonly source: ServiceAccountRandomBytesV1 = (size) => randomBytes(size),
  ) {}

  public issue(): ServiceAccountSecretIssueV1 {
    const bytes = this.source(32);
    if (!Buffer.isBuffer(bytes) || bytes.length !== 32) throw new Error('SECRET_GENERATION_FAILED');
    const secret = `dbsa_${bytes.toString('base64url')}`;
    const digest = createHash('sha256').update(secret, 'utf8').digest('hex');
    return Object.freeze({ secret, digest });
  }
}
