import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAuditSealAttestationV1,
  type AuditSealAttestationV1,
  type AuditSealV1,
} from '@databreeze/domain/audit/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryAuditAttestationRepositoryAdapter } from '../../../src/features/aud/adapter/in-memory-audit-attestation-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000811';
const workspaceId = '00000000-0000-4000-8000-000000000812';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000813';
const actorId = '00000000-0000-4000-8000-000000000814';
const correlationId = '00000000-0000-4000-8000-000000000815';

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

function context(workspace = workspaceId, idempotencyKey = 'attestation') {
  const result = createIamTenantContextV1({
    actorId,
    correlationId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function attestation(): AuditSealAttestationV1 {
  const seal: AuditSealV1 = {
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
  const created = createAuditSealAttestationV1(
    seal,
    { attestationId: '00000000-0000-4000-8000-000000000816', signerKeyId: 'key-1' },
    {
      sign: (payload) => `sig:${payload}`,
      verify: (payload, signature) => signature === `sig:${payload}`,
    },
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid attestation');
  return created.value;
}

void test('[AUD-015, AUD-016] attestation storage is immutable and scope isolated', async () => {
  const repository = new InMemoryAuditAttestationRepositoryAdapter();
  const value = attestation();
  await repository.saveAttestation(context(), value);
  assert.deepEqual(await repository.findAttestation(context(), stable(value.attestationId)), value);
  assert.deepEqual(await repository.listAttestations(context(siblingWorkspaceId)), []);
  await repository.saveAttestation(context(), value);
  await assert.rejects(
    repository.saveAttestation(context(), { ...value, signature: 'tampered' }),
    /AUD_IMMUTABLE_ATTESTATION/,
  );
});

void test('[AUD-007, AUD-015] attestation writes roll back transactionally', async () => {
  const repository = new InMemoryAuditAttestationRepositoryAdapter();
  const value = attestation();
  await assert.rejects(
    repository.withTransaction(context(), async (transaction) => {
      await transaction.saveAttestation(context(), value);
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.deepEqual(await repository.listAttestations(context()), []);
});
