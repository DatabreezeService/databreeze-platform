import assert from 'node:assert/strict';
import test from 'node:test';

import { createServiceAccountV1 } from '@databreeze/domain/service-account/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryServiceAccountRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-service-account-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000701';
const otherOrganizationId = '00000000-0000-4000-8000-000000000702';
const workspaceId = '00000000-0000-4000-8000-000000000703';
const accountId = '00000000-0000-4000-8000-000000000704';
const correlationId = '00000000-0000-4000-8000-000000000705';
const actorId = '00000000-0000-4000-8000-000000000706';

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

const stableAccountId = stable(accountId);

function context(scope: unknown, key = 'service-account-repository') {
  const result = createIamTenantContextV1({
    actorId,
    correlationId,
    tenantScope: scope,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function account(overrides: Record<string, unknown> = {}) {
  const result = createServiceAccountV1({
    id: accountId,
    organizationId,
    workspaceId,
    name: 'Import worker',
    permissions: ['artifact.record.read'],
    secretDigest: 'a'.repeat(64),
    secretIssuedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid account');
  return result.value;
}

void test('[IAM-013] service account repository preserves tenant scope and immutable copies', async () => {
  const repository = new InMemoryServiceAccountRepositoryAdapter();
  const organizationContext = context({ scopeType: 'organization', organizationId });
  await repository.saveServiceAccount(organizationContext, account());

  const found = await repository.findServiceAccount(organizationContext, stableAccountId);
  assert.deepEqual(found, account());
  assert.notEqual(found, account());
  assert.equal(
    (await repository.findServiceAccountByDigest(organizationContext, 'a'.repeat(64)))?.id,
    stableAccountId,
  );
  assert.equal(
    await repository.findServiceAccountByDigest(organizationContext, 'b'.repeat(64)),
    undefined,
  );
  assert.equal(
    await repository.findServiceAccount(
      context({ scopeType: 'organization', organizationId: otherOrganizationId }),
      stableAccountId,
    ),
    undefined,
  );
  assert.equal((await repository.listServiceAccounts(organizationContext)).length, 1);
});

void test('[IAM-013] workspace scope is visible to its parent and child context but never another workspace', async () => {
  const repository = new InMemoryServiceAccountRepositoryAdapter();
  const organizationContext = context({ scopeType: 'organization', organizationId }, 'parent');
  await repository.saveServiceAccount(organizationContext, account());
  assert.equal(
    (
      await repository.listServiceAccounts(
        context({ scopeType: 'workspace', organizationId, workspaceId }, 'child'),
      )
    ).length,
    1,
  );
  assert.equal(
    (
      await repository.listServiceAccounts(
        context(
          { scopeType: 'workspace', organizationId, workspaceId: otherOrganizationId },
          'sibling',
        ),
      )
    ).length,
    0,
  );
});

void test('[IAM-013] replacement is revision guarded and transactions roll back on failure', async () => {
  const repository = new InMemoryServiceAccountRepositoryAdapter();
  const organizationContext = context({ scopeType: 'organization', organizationId }, 'transaction');
  await repository.saveServiceAccount(organizationContext, account());
  const changed = Object.freeze({ ...account({ name: 'Changed' }), revision: 2 });
  await assert.rejects(
    repository.replaceServiceAccount(organizationContext, changed, 2),
    /REVISION_CONFLICT/,
  );
  await assert.rejects(
    repository.withTransaction(organizationContext, async (transaction) => {
      await transaction.replaceServiceAccount(organizationContext, changed, 1);
      throw new Error('ROLLBACK');
    }),
    /ROLLBACK/,
  );
  assert.equal(
    (await repository.findServiceAccount(organizationContext, stableAccountId))?.name,
    'Import worker',
  );
});

void test('[IAM-013] replacement cannot move an account across workspace scope', async () => {
  const repository = new InMemoryServiceAccountRepositoryAdapter();
  const workspaceContext = context(
    { scopeType: 'workspace', organizationId, workspaceId },
    'scope',
  );
  await repository.saveServiceAccount(
    context({ scopeType: 'organization', organizationId }, 'parent'),
    account({ workspaceId: undefined }),
  );
  const moved = Object.freeze({
    ...account({ workspaceId }),
    revision: 2,
  });

  await assert.rejects(
    repository.replaceServiceAccount(workspaceContext, moved, 1),
    /SCOPE_DENIED/u,
  );
  assert.equal(
    (
      await repository.findServiceAccount(
        context({ scopeType: 'organization', organizationId }, 'read'),
        stableAccountId,
      )
    )?.workspaceId,
    undefined,
  );
});
