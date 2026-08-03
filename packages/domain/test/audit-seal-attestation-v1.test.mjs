import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import {
  appendAuditEventV1,
  createAuditSealAttestationV1,
  createAuditSealV1,
  verifyAuditSealAttestationV1,
} from '../dist/audit/v1.js';

const digest = { digest: (value) => createHash('sha256').update(value, 'utf8').digest('hex') };
const scope = { scopeType: 'organization', organizationId: '00000000-0000-4000-8000-000000000741' };

function event() {
  const result = appendAuditEventV1(
    { events: [] },
    {
      eventId: '00000000-0000-4000-8000-000000000742',
      action: 'service_account.created',
      tenantScope: scope,
      actor: { actorType: 'USER', actorId: '00000000-0000-4000-8000-000000000743' },
      entityType: 'service-account',
      entityId: '00000000-0000-4000-8000-000000000744',
      entityRevision: 1,
      occurredAt: '2026-01-01T00:00:00.000Z',
      correlationId: '00000000-0000-4000-8000-000000000745',
      idempotencyKey: 'attestation',
    },
    digest,
  );
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid event');
  return result.value.event;
}

void test('[AUD-015, AUD-016] attestations bind an immutable seal range and signer key', () => {
  const sealResult = createAuditSealV1([event()], scope, '2026-01-01T00:01:00.000Z', digest);
  assert.equal(sealResult.accepted, true);
  if (!sealResult.accepted) return;
  const signer = { sign: (payload) => `sig:${payload}`, verify: (payload, signature) => signature === `sig:${payload}` };
  const attestation = createAuditSealAttestationV1(
    sealResult.value,
    { attestationId: '00000000-0000-4000-8000-000000000746', signerKeyId: 'audit-key-1' },
    signer,
  );
  assert.equal(attestation.accepted, true);
  if (!attestation.accepted) return;
  assert.deepEqual(verifyAuditSealAttestationV1(attestation.value, sealResult.value, signer), {
    accepted: true,
    value: true,
  });
  assert.deepEqual(
    verifyAuditSealAttestationV1(
      { ...attestation.value, tenantScope: { ...scope, organizationId: '00000000-0000-4000-8000-000000000747' } },
      sealResult.value,
      signer,
    ),
    { accepted: false, code: 'CHAIN_INVALID' },
  );
});
