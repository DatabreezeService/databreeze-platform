import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import { Ed25519DeviceEnrollmentProofVerifierAdapter } from '../../../src/features/iam/adapter/ed25519-device-enrollment-proof-verifier.adapter.js';
import type { DeviceEnrollmentProofVerifierV1 } from '../../../src/features/iam/application/device-identity.service.js';

void test('verifies the Android Ed25519 proof over the server challenge digest', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const digest = 'a'.repeat(64);
  const proof = sign(null, Buffer.from(digest, 'utf8'), privateKey).toString('base64');
  const encodedPublicKey = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const verifier = new Ed25519DeviceEnrollmentProofVerifierAdapter();
  const challenge = {
    schemaVersion: 1 as const,
    id: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002',
    organizationId: '00000000-0000-4000-8000-000000000003',
    platform: 'ANDROID' as const,
    installationIdHash: 'b'.repeat(64),
    challengeDigest: digest,
    status: 'PENDING' as const,
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T00:05:00.000Z',
    revision: 1,
  } as unknown as Parameters<DeviceEnrollmentProofVerifierV1['verify']>[0]['challenge'];
  assert.equal(
    verifier.verify({ challenge, publicKey: encodedPublicKey, proof, now: challenge.issuedAt }),
    true,
  );
  const tampered = `${proof[0] === 'A' ? 'B' : 'A'}${proof.slice(1)}`;
  assert.equal(
    verifier.verify({
      challenge,
      publicKey: encodedPublicKey,
      proof: tampered,
      now: challenge.issuedAt,
    }),
    false,
  );
});
