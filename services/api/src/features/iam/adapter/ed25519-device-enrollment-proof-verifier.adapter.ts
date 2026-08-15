import { createPublicKey, verify } from 'node:crypto';

import type {
  DeviceEnrollmentProofVerifierV1,
} from '../application/device-identity.service.js';

/**
 * Production proof-of-possession verifier for Android/Windows DeviceIdentity enrollment.
 * Public keys are DER/SPKI base64 and proofs are signatures over the server-issued digest.
 */
export class Ed25519DeviceEnrollmentProofVerifierAdapter
  implements DeviceEnrollmentProofVerifierV1
{
  public verify(input: Parameters<DeviceEnrollmentProofVerifierV1['verify']>[0]): boolean {
    if (
      typeof input.publicKey !== 'string' ||
      typeof input.proof !== 'string' ||
      input.publicKey.length > 2048 ||
      input.proof.length > 4096 ||
      !/^[A-Za-z0-9+/]+={0,2}$/u.test(input.publicKey) ||
      !/^[A-Za-z0-9+/]+={0,2}$/u.test(input.proof)
    )
      return false;
    try {
      const publicKey = createPublicKey({
        key: Buffer.from(input.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
      const signature = Buffer.from(input.proof, 'base64');
      if (signature.length !== 64) return false;
      return verify(
        null,
        Buffer.from(input.challenge.challengeDigest, 'utf8'),
        publicKey,
        signature,
      );
    } catch {
      return false;
    }
  }
}
