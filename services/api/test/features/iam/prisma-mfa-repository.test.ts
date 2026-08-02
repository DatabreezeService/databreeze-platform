/* eslint-disable @typescript-eslint/require-await -- Prisma delegate doubles intentionally mirror async client signatures. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMfaFactorV1,
  createRecoveryCodeV1,
  transitionMfaFactorV1,
} from '@databreeze/domain/mfa/v1';
import type { MfaStateV1 } from '@databreeze/domain/mfa/v1';

import {
  PrismaMfaRepositoryAdapter,
  type MfaDatabaseClientV1,
  type MfaFactorDatabaseRowV1,
  type MfaRecoveryCodeDatabaseRowV1,
} from '../../../src/features/iam/adapter/prisma-mfa-repository.adapter.js';

const userId = '00000000-0000-4000-8000-000000000001';
const factorId = '00000000-0000-4000-8000-000000000002';
const recoveryId = '00000000-0000-4000-8000-000000000003';
const createdAt = new Date('2026-01-01T00:00:00.000Z');

function createDatabase(): {
  readonly client: MfaDatabaseClientV1;
  readonly factors: Map<string, MfaFactorDatabaseRowV1>;
  readonly recoveryCodes: Map<string, MfaRecoveryCodeDatabaseRowV1>;
} {
  const factors = new Map<string, MfaFactorDatabaseRowV1>();
  const recoveryCodes = new Map<string, MfaRecoveryCodeDatabaseRowV1>();
  const client = {
    mfaFactor: {
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        [...factors.values()].filter((row) =>
          Object.entries(where).every(
            ([key, value]) => row[key as keyof MfaFactorDatabaseRowV1] === value,
          ),
        ),
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        factors.get(where.id) ?? null,
      create: async ({ data }: { readonly data: MfaFactorDatabaseRowV1 }) => {
        factors.set(data.id, data);
        return data;
      },
      update: async ({
        where,
        data,
      }: {
        readonly where: { readonly id: string };
        readonly data: Partial<MfaFactorDatabaseRowV1>;
      }) => {
        const current = factors.get(where.id);
        if (!current) throw new Error('MFA_FACTOR_NOT_FOUND');
        const updated = { ...current, ...data };
        factors.set(where.id, updated);
        return updated;
      },
    },
    mfaRecoveryCode: {
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        [...recoveryCodes.values()].filter((row) =>
          Object.entries(where).every(
            ([key, value]) => row[key as keyof MfaRecoveryCodeDatabaseRowV1] === value,
          ),
        ),
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        recoveryCodes.get(where.id) ?? null,
      create: async ({ data }: { readonly data: MfaRecoveryCodeDatabaseRowV1 }) => {
        recoveryCodes.set(data.id, data);
        return data;
      },
      update: async ({
        where,
        data,
      }: {
        readonly where: { readonly id: string };
        readonly data: Partial<MfaRecoveryCodeDatabaseRowV1>;
      }) => {
        const current = recoveryCodes.get(where.id);
        if (!current) throw new Error('MFA_RECOVERY_CODE_NOT_FOUND');
        const updated = { ...current, ...data };
        recoveryCodes.set(where.id, updated);
        return updated;
      },
    },
    $transaction: async <TValue>(work: (transaction: MfaDatabaseClientV1) => Promise<TValue>) => {
      const beforeFactors = new Map(factors);
      const beforeCodes = new Map(recoveryCodes);
      try {
        return await work(client);
      } catch (error) {
        factors.clear();
        recoveryCodes.clear();
        for (const [id, row] of beforeFactors) factors.set(id, row);
        for (const [id, row] of beforeCodes) recoveryCodes.set(id, row);
        throw error;
      }
    },
  } as unknown as MfaDatabaseClientV1;
  return { client, factors, recoveryCodes };
}

function state(): MfaStateV1 {
  const factor = createMfaFactorV1({
    id: factorId,
    userId,
    method: 'TOTP',
    secretReference: 'kms://mfa/secret/1',
    enrolledAt: createdAt.toISOString(),
  });
  const code = createRecoveryCodeV1({
    id: recoveryId,
    userId,
    digest: 'digest-1',
    createdAt: createdAt.toISOString(),
  });
  assert.equal(factor.accepted, true);
  assert.equal(code.accepted, true);
  if (!factor.accepted || !code.accepted) throw new Error('fixture invalid');
  return { factors: [factor.value], recoveryCodes: [code.value] };
}

void test('[IAM-012, IAM-014] Prisma MFA persistence round-trips opaque factors and recovery digests', async () => {
  const { client, factors, recoveryCodes } = createDatabase();
  const adapter = new PrismaMfaRepositoryAdapter(client);
  const input = state();
  const factor = input.factors[0];
  if (!factor) throw new Error('fixture missing factor');
  await adapter.saveState(factor.userId, input);
  assert.equal(factors.size, 1);
  assert.equal(recoveryCodes.size, 1);
  assert.deepEqual(await adapter.findState(factor.userId), input);
});

void test('[IAM-012, IAM-014] status transitions persist by revision while immutable secrets and digests remain fixed', async () => {
  const { client } = createDatabase();
  const adapter = new PrismaMfaRepositoryAdapter(client);
  const input = state();
  const factor = input.factors[0];
  if (!factor) throw new Error('fixture missing factor');
  await adapter.saveState(factor.userId, input);
  const transitioned = transitionMfaFactorV1(factor, 'VERIFY', '2026-01-01T00:01:00.000Z');
  assert.equal(transitioned.accepted, true);
  if (!transitioned.accepted) return;
  await adapter.saveState(factor.userId, {
    factors: [transitioned.value],
    recoveryCodes: input.recoveryCodes,
  });
  const stored = await adapter.findState(factor.userId);
  const storedFactor = stored.factors[0];
  if (!storedFactor) throw new Error('stored factor missing');
  assert.equal(storedFactor.status, 'ACTIVE');
  assert.equal(storedFactor.revision, 2);
  assert.equal(storedFactor.secretReference, 'kms://mfa/secret/1');
});

void test('[IAM-009, IAM-012] MFA state cannot cross users and failed transactions roll back', async () => {
  const { client, factors } = createDatabase();
  const adapter = new PrismaMfaRepositoryAdapter(client);
  const input = state();
  const factor = input.factors[0];
  if (!factor) throw new Error('fixture missing factor');
  await assert.rejects(
    adapter.saveState('00000000-0000-4000-8000-000000000099', input),
    /MFA_SCOPE_MISMATCH/,
  );
  await assert.rejects(
    adapter.withTransaction(async (transaction) => {
      await transaction.saveState(factor.userId, input);
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.equal(factors.size, 0);
});
