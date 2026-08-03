import assert from 'node:assert/strict';
import test from 'node:test';

import { createServiceAccountV1, type ServiceAccountV1 } from '@databreeze/domain/service-account/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaServiceAccountRepositoryAdapter,
  type ServiceAccountDatabaseClientV1,
} from '../../../src/features/iam/adapter/prisma-service-account-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000721';
const workspaceId = '00000000-0000-4000-8000-000000000722';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000723';
const accountId = '00000000-0000-4000-8000-000000000724';
const actorId = '00000000-0000-4000-8000-000000000725';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

function context(scope: unknown, key = 'prisma-service-account') {
  const result = createIamTenantContextV1({
    actorId,
    correlationId: '00000000-0000-4000-8000-000000000726',
    tenantScope: scope,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function account(): ServiceAccountV1 {
  const result = createServiceAccountV1({
    id: accountId,
    organizationId,
    workspaceId,
    name: 'Import worker',
    permissions: ['artifact.record.read'],
    secretDigest: 'a'.repeat(64),
    secretIssuedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid account');
  return result.value;
}

function delegate(rows: Record<string, unknown>[], forceConflict = false) {
  return {
    create({ data }: { readonly data: Record<string, unknown> }) {
      const persisted = { ...data };
      rows.push(persisted);
      return Promise.resolve(persisted);
    },
    findFirst({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      return Promise.resolve(
        rows.find((row) => {
          if (where['OR']) {
            const alternatives = where['OR'] as readonly Record<string, unknown>[];
            const base = Object.fromEntries(Object.entries(where).filter(([key]) => key !== 'OR'));
            return (
              Object.entries(base).every(([key, value]) => row[key] === value) &&
              alternatives.some((candidate) =>
                Object.entries(candidate).every(([key, value]) => row[key] === value),
              )
            );
          }
          return Object.entries(where).every(([key, value]) => row[key] === value);
        }) ?? null,
      );
    },
    findMany({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      return Promise.resolve(
        rows.filter((row) => {
          if (where['OR']) {
            const alternatives = where['OR'] as readonly Record<string, unknown>[];
            const base = Object.fromEntries(Object.entries(where).filter(([key]) => key !== 'OR'));
            return (
              Object.entries(base).every(([key, value]) => row[key] === value) &&
              alternatives.some((candidate) =>
                Object.entries(candidate).every(([key, value]) => row[key] === value),
              )
            );
          }
          return Object.entries(where).every(([key, value]) => row[key] === value);
        }),
      );
    },
    updateMany({
      where,
      data,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Record<string, unknown>;
    }) {
      if (forceConflict) return Promise.resolve({ count: 0 });
      const index = rows.findIndex((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      );
      if (index < 0) return Promise.resolve({ count: 0 });
      rows[index] = { ...rows[index], ...data };
      return Promise.resolve({ count: 1 });
    },
  };
}

function rowFor(value = account()): Record<string, unknown> {
  return {
    id: value.id,
    organizationId: value.organizationId,
    workspaceId: value.workspaceId ?? null,
    name: value.name,
    permissions: value.permissions,
    status: value.status,
    secretDigest: value.secretDigest,
    secretVersion: value.secretVersion,
    secretIssuedAt: new Date(value.secretIssuedAt),
    secretExpiresAt: value.secretExpiresAt ? new Date(value.secretExpiresAt) : null,
    lastUsedAt: value.lastUsedAt ? new Date(value.lastUsedAt) : null,
    createdAt: new Date(value.createdAt),
    revokedAt: value.revokedAt ? new Date(value.revokedAt) : null,
    revision: value.revision,
  };
}

function client(
  rows: Record<string, unknown>[] = [],
  forceConflict = false,
): ServiceAccountDatabaseClientV1 {
  const database = {
    serviceAccount: delegate(rows, forceConflict),
    async $transaction<TValue>(
      work: (transaction: ServiceAccountDatabaseClientV1) => Promise<TValue>,
    ) {
      return work(database as unknown as ServiceAccountDatabaseClientV1);
    },
  };
  return database as unknown as ServiceAccountDatabaseClientV1;
}

void test('[IAM-013] Prisma service-account adapter persists and filters workspace scope', async () => {
  const rows: Record<string, unknown>[] = [];
  const repository = new PrismaServiceAccountRepositoryAdapter(client(rows));
  await repository.saveServiceAccount(context({ scopeType: 'organization', organizationId }), account());
  assert.equal(
    (await repository.findServiceAccount(context({ scopeType: 'workspace', organizationId, workspaceId }), stable(accountId)))?.name,
    'Import worker',
  );
  assert.equal(
    (await repository.findServiceAccount(context({ scopeType: 'workspace', organizationId, workspaceId: siblingWorkspaceId }), stable(accountId))),
    undefined,
  );
  assert.equal((await repository.listServiceAccounts(context({ scopeType: 'organization', organizationId }))).length, 1);
});

void test('[IAM-013] Prisma service-account adapter uses optimistic revisions and rejects races', async () => {
  const repository = new PrismaServiceAccountRepositoryAdapter(client([rowFor()]));
  const next = Object.freeze({ ...account(), name: 'Changed', revision: 2 });
  await repository.replaceServiceAccount(context({ scopeType: 'organization', organizationId }), next, 1);
  await assert.rejects(
    new PrismaServiceAccountRepositoryAdapter(client([rowFor()], true)).replaceServiceAccount(
      context({ scopeType: 'organization', organizationId }),
      next,
      1,
    ),
    /REVISION_CONFLICT/u,
  );
});

void test('[IAM-013] Prisma service-account adapter fails closed on malformed persisted state', async () => {
  const malformed = rowFor();
  malformed['secretDigest'] = 'not-a-digest';
  const repository = new PrismaServiceAccountRepositoryAdapter(
    client([malformed]),
  );
  await assert.rejects(
    repository.findServiceAccount(context({ scopeType: 'organization', organizationId }), stable(accountId)),
    /IAM_PERSISTED_SERVICE_ACCOUNT_INVALID/u,
  );
});
