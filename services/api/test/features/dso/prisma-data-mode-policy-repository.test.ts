import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDataModePolicyVersionV1,
  type DataModePolicyVersionV1,
} from '@databreeze/domain/data-mode/v1';

import {
  PrismaDataModePolicyRepositoryAdapter,
  type DataModePolicyDatabaseClientV1,
} from '../../../src/features/dso/adapter/prisma-data-mode-policy-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000641';
const workspaceId = '00000000-0000-4000-8000-000000000642';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000643';
const policyId = '00000000-0000-4000-8000-000000000644';
const versionId = '00000000-0000-4000-8000-000000000645';

function context(candidateWorkspaceId: string, key: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000646',
    correlationId: '00000000-0000-4000-8000-000000000647',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: candidateWorkspaceId },
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function policy(): DataModePolicyVersionV1 {
  const result = createDataModePolicyVersionV1({
    policyId,
    policyVersionId: versionId,
    organizationId,
    workspaceId,
    revision: 1,
    mode: 'HYBRID',
    allowedPayloadClasses: {
      PUBLIC: ['CONTROL_METADATA'],
      INTERNAL: ['CONTROL_METADATA'],
      CONFIDENTIAL: ['CONTROL_METADATA'],
      RESTRICTED: [],
    },
    allowedPlacementKinds: ['LOCAL', 'CLOUD'],
    allowedExecutorClasses: ['DESKTOP', 'CLOUD'],
    allowedDestinationClasses: ['WEB', 'DESKTOP'],
    canonicalHash: 'e'.repeat(64),
    publishedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid policy');
  return result.value;
}

function delegate(rows: Record<string, unknown>[]) {
  return {
    create({ data }: { readonly data: Record<string, unknown> }) {
      const persisted = { ...data };
      rows.push(persisted);
      return Promise.resolve(persisted);
    },
    findUnique({ where }: { readonly where: { readonly id: string } }) {
      return Promise.resolve(rows.find((row) => row['id'] === where.id) ?? null);
    },
    findMany({
      where,
      orderBy,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
    }) {
      const [field, direction] = Object.entries(orderBy)[0] ?? ['id', 'asc'];
      return Promise.resolve(
        rows
          .filter((row) => Object.entries(where).every(([key, value]) => row[key] === value))
          .sort((left, right) => {
            const comparison = String(left[field]).localeCompare(String(right[field]));
            return direction === 'desc' ? -comparison : comparison;
          }),
      );
    },
  };
}

function client(): DataModePolicyDatabaseClientV1 {
  const rows: Record<string, unknown>[] = [];
  const database = {
    deviceDataModePolicyRecord: delegate(rows),
    async $transaction<TValue>(
      work: (transaction: DataModePolicyDatabaseClientV1) => Promise<TValue>,
    ) {
      return work(database as unknown as DataModePolicyDatabaseClientV1);
    },
  };
  return database as unknown as DataModePolicyDatabaseClientV1;
}

void test('[DSO-008, DSO-026, IAM-009] Prisma policy adapter persists immutable versions and filters sibling workspaces', async () => {
  const repository = new PrismaDataModePolicyRepositoryAdapter(client());
  await repository.save(context(workspaceId, 'save'), policy());
  assert.equal(
    (await repository.find(context(workspaceId, 'find'), policy().policyVersionId))?.mode,
    'HYBRID',
  );
  assert.equal(
    (await repository.list(context(siblingWorkspaceId, 'sibling'), policy().policyId)).length,
    0,
  );
  await assert.rejects(
    repository.save(context(workspaceId, 'conflict'), { ...policy(), mode: 'LOCAL' }),
    /DSO_IMMUTABLE_POLICY/,
  );
});
