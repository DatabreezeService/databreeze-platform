import assert from 'node:assert/strict';
import test from 'node:test';

import { type AuditSealV1 } from '@databreeze/domain/audit/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryAuditAttestationRepositoryAdapter } from '../../../src/features/aud/adapter/in-memory-audit-attestation-repository.adapter.js';
import { AuditAttestationService } from '../../../src/features/aud/application/audit-attestation.service.js';
import { InMemoryAuditRepositoryAdapter } from '../../../src/features/aud/adapter/in-memory-audit-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000831';
const workspaceId = '00000000-0000-4000-8000-000000000832';
const actorId = '00000000-0000-4000-8000-000000000833';
const correlationId = '00000000-0000-4000-8000-000000000834';
const attestationId = '00000000-0000-4000-8000-000000000836';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

function timestamp(value: string) {
  const parsed = parseStrictUtcTimestampV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid timestamp');
  return parsed.value;
}

function context(idempotencyKey = 'attestation-service') {
  const result = createIamTenantContextV1({
    actorId,
    correlationId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function seal(): AuditSealV1 {
  return {
    schemaVersion: 1,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(organizationId),
      workspaceId: stable(workspaceId),
    },
    firstSequence: 1,
    lastSequence: 3,
    eventCount: 3,
    rootDigest: 'root-digest',
    sealedAt: timestamp('2026-01-01T00:01:00.000Z'),
  };
}

async function setup() {
  const auditRepository = new InMemoryAuditRepositoryAdapter();
  await auditRepository.saveSeal(context(), seal());
  const attestationRepository = new InMemoryAuditAttestationRepositoryAdapter();
  const service = new AuditAttestationService(
    auditRepository,
    attestationRepository,
    {
      sign: (payload) => `sig:${payload}`,
      verify: (payload, signature) => signature === `sig:${payload}`,
    },
    () => attestationId,
  );
  return { service, attestationRepository };
}

void test('[AUD-015, AUD-016] service signs only a persisted exact-scope seal and verifies it', async () => {
  const { service, attestationRepository } = await setup();
  const created = await service.create(context(), {
    signerKeyId: 'audit-key-1',
    firstSequence: 1,
    lastSequence: 3,
    rootDigest: 'root-digest',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.deepEqual(await service.verify(context(), { attestationId }), {
    accepted: true,
    value: true,
  });
  assert.deepEqual(
    await attestationRepository.findAttestation(context(), stable(attestationId)),
    created.value,
  );
});

void test('[AUD-015] service rejects missing seals and malformed selectors before signing', async () => {
  const { service } = await setup();
  assert.deepEqual(
    await service.create(context(), {
      signerKeyId: 'audit-key-1',
      firstSequence: 2,
      lastSequence: 1,
      rootDigest: 'root-digest',
    }),
    { accepted: false, code: 'INVALID_SEQUENCE' },
  );
  assert.deepEqual(
    await service.create(context(), {
      signerKeyId: 'audit-key-1',
      firstSequence: 1,
      lastSequence: 3,
      rootDigest: 'missing',
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
});
