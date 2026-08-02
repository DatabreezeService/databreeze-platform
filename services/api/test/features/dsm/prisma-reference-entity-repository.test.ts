import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createBusinessPartyVersionV1 } from '@databreeze/domain/reference-entity/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import {
  PrismaReferenceEntityRepositoryAdapter,
  type ReferenceEntityDatabaseClientV1,
  type ReferenceEntityDatabaseRowV1,
  type ReferenceResolutionDatabaseRowV1,
} from '../../../src/features/dsm/adapter/prisma-reference-entity-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

function id(value: string): StableIdentifierV1 {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture id rejected');
  return result.value;
}
const organizationId = id('00000000-0000-4000-8000-000000000401');
const workspaceId = id('00000000-0000-4000-8000-000000000402');
const entityId = id('00000000-0000-4000-8000-000000000403');
const versionId = id('00000000-0000-4000-8000-000000000404');

function context(key: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000405',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000406',
    idempotencyKey: key,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function client(
  rows: ReferenceEntityDatabaseRowV1[],
  resolutions: ReferenceResolutionDatabaseRowV1[],
): ReferenceEntityDatabaseClientV1 {
  return {
    referenceEntityVersionRecord: {
      create(input) {
        const persisted = { ...input.data } as ReferenceEntityDatabaseRowV1;
        rows.push(persisted);
        return Promise.resolve(persisted);
      },
      findUnique(input) {
        return Promise.resolve(rows.find((candidate) => candidate.id === input.where.id) ?? null);
      },
      findMany(input) {
        return Promise.resolve(
          rows
            .filter((candidate) => candidate.entityId === input.where['entityId'])
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
        );
      },
    },
    referenceEntityResolutionRecord: {
      create(input) {
        const persisted = { ...input.data } as ReferenceResolutionDatabaseRowV1;
        resolutions.push(persisted);
        return Promise.resolve(persisted);
      },
      findMany(input) {
        return Promise.resolve(
          resolutions.filter(
            (candidate) => candidate.sourceEntityId === input.where['sourceEntityId'],
          ),
        );
      },
    },
    $transaction(work) {
      return work(this);
    },
  };
}

void test('[DSM-025, IAM-009] Prisma reference entity adapter preserves immutable versions and scope', async () => {
  const createdAt = parseStrictUtcTimestampV1('2026-01-01T00:00:00.000Z');
  assert.equal(createdAt.accepted, true);
  if (!createdAt.accepted) throw new Error('fixture timestamp rejected');
  const version = createBusinessPartyVersionV1({
    entityId,
    versionId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    displayName: 'Supplier',
    roles: ['SUPPLIER'],
    canonicalHash: 'd'.repeat(64),
    createdAt: createdAt.value,
  });
  assert.equal(version.accepted, true);
  if (!version.accepted) throw new Error('fixture entity rejected');
  const rows: ReferenceEntityDatabaseRowV1[] = [];
  const repository = new PrismaReferenceEntityRepositoryAdapter(client(rows, []));
  await repository.saveVersion(context('save'), version.value);
  assert.equal((await repository.findLatest(context('latest'), entityId))?.displayName, 'Supplier');
});
