import { createHmac, timingSafeEqual } from 'node:crypto';

import type { EntitlementLeaseSignerV1 } from '../application/entitlement-lease.service.js';

const HMAC_ALGORITHM = 'sha256';
const MINIMUM_KEY_BYTES = 32;

/** Provider-neutral HMAC signer for short-lived entitlement leases. */
export class HmacEntitlementLeaseSignerAdapter implements EntitlementLeaseSignerV1 {
  private readonly key: Uint8Array;

  public constructor(key: Uint8Array | string) {
    const normalized = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key);
    if (normalized.length < MINIMUM_KEY_BYTES) throw new Error('BUA_LEASE_SIGNING_KEY_TOO_SHORT');
    this.key = normalized;
  }

  public sign(payload: string): string {
    return createHmac(HMAC_ALGORITHM, this.key).update(payload, 'utf8').digest('base64url');
  }

  public verify(payload: string, signature: string): boolean {
    if (signature.length === 0 || signature.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(signature))
      return false;
    let presented: Buffer;
    try {
      presented = Buffer.from(signature, 'base64url');
    } catch {
      return false;
    }
    const expected = createHmac(HMAC_ALGORITHM, this.key).update(payload, 'utf8').digest();
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  }
}
