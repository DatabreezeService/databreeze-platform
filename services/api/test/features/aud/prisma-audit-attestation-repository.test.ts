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

import {
  PrismaAuditAttestationRepositoryAdapter,
  type AuditAttestationDatabaseClientV1,
} from '../../../src/features/aud/adapter/prisma-audit-attestation-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000821';
const workspaceId = '00000000-0000-4000-8000-000000000822';
const actorId = '00000000-0000-4000-8000-000000000823';
const correlationId = '00000000-0000-4000-8000-000000000824';

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

function context() {
  const result = createIamTenantContextV1({
    actorId,
    correlationId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    idempotencyKey: 'prisma-attestation',
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
    lastSequence: 2,
    eventCount: 2,
    rootDigest: 'root',
    sealedAt: timestamp('2026-01-01T00:01:00.000Z'),
  };
  const created = createAuditSealAttestationV1(
    seal,
    { attestationId: '00000000-0000-4000-8000-000000000825', signerKeyId: 'key-1' },
    {
      sign: (payload) => `sig:${payload}`,
      verify: (payload, signature) => signature === `sig:${payload}`,
    },
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid attestation');
  return created.value;
}

function delegate(rows: Record<string, unknown>[]) {
  const matches = (
    row: Record<string, unknown>,
    where: Readonly<Record<string, unknown>>,
  ): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR' && Array.isArray(value))
        return value.some((candidate) =>
          matches(row, candidate as Readonly<Record<string, unknown>>),
        );
      return row[key] === value;
    });
  return {
    create({ data }: { readonly data: Record<string, unknown> }) {
      const row = { ...data };
      rows.push(row);
      return Promise.resolve(row);
    },
    findFirst({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      return Promise.resolve(rows.find((row) => matches(row, where)) ?? null);
    },
    findMany({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      return Promise.resolve(rows.filter((row) => matches(row, where)));
    },
  };
}

function client(rows: Record<string, unknown>[] = []): AuditAttestationDatabaseClientV1 {
  const database = {
    auditSealAttestationRecord: delegate(rows),
  } as unknown as AuditAttestationDatabaseClientV1;
  return {
    ...database,
    async $transaction<TValue>(
      work: (transaction: AuditAttestationDatabaseClientV1) => Promise<TValue>,
    ) {
      return work(database);
    },
  };
}

void test('[AUD-015, AUD-016] Prisma attestation adapter persists immutable rows and scopes reads', async () => {
  const repository = new PrismaAuditAttestationRepositoryAdapter(client());
  const value = attestation();
  await repository.saveAttestation(context(), value);
  assert.deepEqual(await repository.findAttestation(context(), stable(value.attestationId)), value);
  assert.deepEqual(await repository.listAttestations(context()), [value]);
  await repository.saveAttestation(context(), value);
  await assert.rejects(
    repository.saveAttestation(context(), { ...value, signature: 'tampered' }),
    /AUD_IMMUTABLE_ATTESTATION/,
  );
});
