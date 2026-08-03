import assert from 'node:assert/strict';
import test from 'node:test';

import type { AuditSealAttestationV1 } from '@databreeze/domain/audit/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import { sameAuditSealAttestationV1 } from '../../../src/features/aud/application/audit-equality.js';

function stable(value: string) {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid identifier');
  return result.value;
}

function timestamp(value: string) {
  const result = parseStrictUtcTimestampV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid timestamp');
  return result.value;
}

void test('[AUD-015, AUD-016] attestation equality includes signer binding and signature bytes', () => {
  const base: AuditSealAttestationV1 = {
    schemaVersion: 1,
    attestationId: stable('00000000-0000-4000-8000-000000000801'),
    tenantScope: {
      scopeType: 'organization' as const,
      organizationId: stable('00000000-0000-4000-8000-000000000802'),
    },
    firstSequence: 1,
    lastSequence: 2,
    eventCount: 2,
    rootDigest: 'root',
    sealedAt: timestamp('2026-01-01T00:00:00.000Z'),
    signerKeyId: 'key-1',
    payload: 'payload',
    signature: 'signature',
  };
  assert.equal(sameAuditSealAttestationV1(base, { ...base }), true);
  assert.equal(sameAuditSealAttestationV1(base, { ...base, signerKeyId: 'key-2' }), false);
  assert.equal(sameAuditSealAttestationV1(base, { ...base, signature: 'tampered' }), false);
});
