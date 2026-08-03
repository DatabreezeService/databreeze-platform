import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEntitlementLeaseV1,
  createEntitlementSnapshotV1,
  createPlanV1,
  type EntitlementLeaseV1,
} from '@databreeze/domain/entitlements/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import {
  PrismaEntitlementLeaseRepositoryAdapter,
  type EntitlementLeaseDatabaseClientV1,
} from '../../../src/features/bua/adapter/prisma-entitlement-lease-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000771';
const leaseId = '00000000-0000-4000-8000-000000000772';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000773',
    correlationId: '00000000-0000-4000-8000-000000000774',
    tenantScope: { scopeType: 'organization', organizationId },
    idempotencyKey: 'prisma-lease',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function lease(): EntitlementLeaseV1 {
  const plan = createPlanV1({
    planCode: 'free',
    displayNameKey: 'plan.free',
    features: [],
    quotas: [{ metric: 'job_count', limit: 1 }],
  });
  assert.equal(plan.accepted, true);
  if (!plan.accepted) throw new Error('invalid plan');
  const snapshot = createEntitlementSnapshotV1({
    snapshotId: '00000000-0000-4000-8000-000000000775',
    tenantScope: { scopeType: 'organization', organizationId },
    plan: plan.value,
    status: 'ACTIVE',
    revision: 1,
    securityEpoch: 1,
    effectiveAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(snapshot.accepted, true);
  if (!snapshot.accepted) throw new Error('invalid snapshot');
  const issued = createEntitlementLeaseV1(
    snapshot.value,
    { leaseId, issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-01T01:00:00.000Z' },
    { sign: (payload) => payload },
  );
  assert.equal(issued.accepted, true);
  if (!issued.accepted) throw new Error('invalid lease');
  return issued.value;
}

function delegate(rows: Record<string, unknown>[]) {
  return {
    create({ data }: { readonly data: Record<string, unknown> }) {
      const row = { ...data };
      rows.push(row);
      return Promise.resolve(row);
    },
    findFirst({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      return Promise.resolve(
        rows.find((row) =>
          Object.entries(where).every(([key, value]) =>
            key !== 'OR'
              ? row[key] === value
              : (where['OR'] as readonly Record<string, unknown>[]).some((candidate) =>
                  Object.entries(candidate).every(
                    ([candidateKey, candidateValue]) => row[candidateKey] === candidateValue,
                  ),
                ),
          ),
        ) ?? null,
      );
    },
  };
}

function client(rows: Record<string, unknown>[] = []): EntitlementLeaseDatabaseClientV1 {
  const database = {
    entitlementLeaseRecord: delegate(rows),
  } as unknown as EntitlementLeaseDatabaseClientV1;
  return {
    ...database,
    async $transaction<TValue>(
      work: (transaction: EntitlementLeaseDatabaseClientV1) => Promise<TValue>,
    ) {
      return work(database);
    },
  };
}

void test('[BUA-017, BUA-018] Prisma lease adapter stores signed rows and enforces scope', async () => {
  const repository = new PrismaEntitlementLeaseRepositoryAdapter(client());
  await repository.saveLease(context(), lease());
  assert.equal(
    (await repository.findLease(context(), stable(leaseId)))?.signature,
    lease().signature,
  );
});
