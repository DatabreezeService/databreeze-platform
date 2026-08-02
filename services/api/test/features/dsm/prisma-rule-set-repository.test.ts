import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createRuleSetDefinitionV1 } from '@databreeze/domain/rule-set/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import {
  PrismaRuleSetRepositoryAdapter,
  type RuleSetDatabaseClientV1,
  type RuleSetDatabaseRowV1,
} from '../../../src/features/dsm/adapter/prisma-rule-set-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

function id(value: string): StableIdentifierV1 {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture id rejected');
  return result.value;
}

const organizationId = id('00000000-0000-4000-8000-000000000301');
const workspaceId = id('00000000-0000-4000-8000-000000000302');
const datasetId = id('00000000-0000-4000-8000-000000000303');
const versionId = id('00000000-0000-4000-8000-000000000304');
const schemaVersionId = id('00000000-0000-4000-8000-000000000305');
const ruleId = id('00000000-0000-4000-8000-000000000306');
const fieldId = id('00000000-0000-4000-8000-000000000307');

function context(key: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000308',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000309',
    idempotencyKey: key,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function client(rows: RuleSetDatabaseRowV1[]): RuleSetDatabaseClientV1 {
  return {
    ruleSetDefinitionRecord: {
      create(input) {
        const persisted = { ...input.data } as RuleSetDatabaseRowV1;
        rows.push(persisted);
        return Promise.resolve(persisted);
      },
      findUnique(input) {
        return Promise.resolve(rows.find((candidate) => candidate.id === input.where.id) ?? null);
      },
      findMany(input) {
        return Promise.resolve(
          rows
            .filter((candidate) => candidate.datasetId === input.where['datasetId'])
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
        );
      },
    },
    $transaction(work) {
      return work(this);
    },
  };
}

void test('[DSM-009, DSM-010, IAM-009] Prisma rule-set adapter persists and lists declarative rules', async () => {
  const createdAt = parseStrictUtcTimestampV1('2026-01-01T00:00:00.000Z');
  assert.equal(createdAt.accepted, true);
  if (!createdAt.accepted) throw new Error('fixture timestamp rejected');
  const created = createRuleSetDefinitionV1({
    datasetId,
    versionId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    schemaVersionId,
    rules: [{ ruleId, fieldId, kind: 'REQUIRED', severity: 'ERROR', parameters: {} }],
    createdAt: createdAt.value,
    canonicalHash: 'c'.repeat(64),
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('fixture rule set rejected');
  const rows: RuleSetDatabaseRowV1[] = [];
  const repository = new PrismaRuleSetRepositoryAdapter(client(rows));
  await repository.save(context('save'), created.value);
  assert.equal((await repository.list(context('list'), datasetId)).length, 1);
});
