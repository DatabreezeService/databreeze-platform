import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const id = (tail: string): string => `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const stable = (tail: string): StableIdentifierV1 => {
  const parsed = parseStableIdentifierV1(id(tail));
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
};
const organizationId = stable('1');
const workspaceId = stable('2');
const siblingWorkspaceId = stable('3');
const principalId = stable('4');

function context(scope: unknown, expectedRevision?: number) {
  const result = createIamTenantContextV1({
    tenantScope: scope,
    actorId: principalId,
    correlationId: id('5'),
    idempotencyKey: 'membership-update-1',
    authorizationEpoch: 1,
    expectedRevision,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid test context');
  return result.value;
}

const workspaceScope: TenantScopeV1 = { scopeType: 'workspace', organizationId, workspaceId };
const siblingScope: TenantScopeV1 = {
  scopeType: 'workspace',
  organizationId,
  workspaceId: siblingWorkspaceId,
};

void test('[IAM-009, IAM-019] contexts require complete, versioned tenant scope and identifiers', () => {
  assert.deepEqual(
    createIamTenantContextV1({
      tenantScope: { scopeType: 'workspace', organizationId },
      actorId: principalId,
      correlationId: id('5'),
      idempotencyKey: 'safe',
      authorizationEpoch: 1,
    }),
    { accepted: false, code: 'INVALID_SCOPE' },
  );
  assert.deepEqual(
    createIamTenantContextV1({
      tenantScope: workspaceScope,
      actorId: principalId,
      correlationId: id('5'),
      idempotencyKey: 'bad\nkey',
      authorizationEpoch: 1,
    }),
    { accepted: false, code: 'INVALID_TEXT' },
  );
});

void test('[IAM-009, IAM-019] repository reads never cross sibling workspace scopes', async () => {
  const repository = new InMemoryIamRepositoryAdapter();
  repository.seed([
    {
      id: stable('10'),
      principalId,
      scope: workspaceScope,
      roleId: 'viewer',
      status: 'ACTIVE',
      revision: 1,
    },
    {
      id: stable('11'),
      principalId,
      scope: siblingScope,
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    },
  ]);
  assert.equal((await repository.listMemberships(context(workspaceScope))).length, 1);
  assert.equal(
    (await repository.listMemberships(context({ scopeType: 'organization', organizationId })))
      .length,
    2,
  );
  assert.equal(
    await repository
      .findMembership(context(workspaceScope), principalId)
      .then((value) => value?.id),
    stable('10'),
  );
});

void test('[IAM-009, IAM-019] writes cannot broaden a scoped context and transactions roll back', async () => {
  const repository = new InMemoryIamRepositoryAdapter();
  repository.seed([]);
  await assert.rejects(
    repository.saveMembership(context(workspaceScope), {
      id: stable('20'),
      principalId,
      scope: { scopeType: 'organization', organizationId },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    }),
    /IAM_SCOPE_NARROWING_REQUIRED/u,
  );
  await assert.rejects(
    repository.withTransaction(context(workspaceScope), async (transaction) => {
      await transaction.saveMembership(context(workspaceScope), {
        id: stable('21'),
        principalId,
        scope: workspaceScope,
        roleId: 'viewer',
        status: 'ACTIVE',
        revision: 1,
      });
      throw new Error('rollback-me');
    }),
    /rollback-me/u,
  );
  assert.equal((await repository.listMemberships(context(workspaceScope))).length, 0);
});
