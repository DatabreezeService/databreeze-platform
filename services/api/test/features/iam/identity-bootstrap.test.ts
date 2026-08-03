import assert from 'node:assert/strict';
import test from 'node:test';

import { bootstrapPersonalOrganizationV1 } from '@databreeze/domain/identity/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryIdentityBootstrapRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-identity-bootstrap-repository.adapter.js';
import { IdentityBootstrapService } from '../../../src/features/iam/application/identity-bootstrap.service.js';

const input = {
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    displayName: 'Nguyen An',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  organizationId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  projectId: '00000000-0000-4000-8000-000000000004',
  membershipId: '00000000-0000-4000-8000-000000000005',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

void test('[IAM-001, IAM-009, IAM-011, IAM-016] bootstrap creates a personal owner hierarchy once', async () => {
  const repository = new InMemoryIdentityBootstrapRepositoryAdapter();
  const service = new IdentityBootstrapService(repository);
  const first = await service.create(input);
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.value.organization.personal, true);
  assert.equal(first.value.membership.roleId, 'owner');
  assert.equal(first.value.membership.scope.scopeType, 'organization');
  assert.deepEqual(await service.create(input), first);
  const stored = await repository.findByUserId(first.value.user.id);
  assert.deepEqual(stored, first.value);
  assert.deepEqual(await service.find(input.user.id), { accepted: true, value: first.value });
});

void test('[IAM-001, IAM-009] bootstrap reads reject malformed identities and hide absent users', async () => {
  const service = new IdentityBootstrapService(new InMemoryIdentityBootstrapRepositoryAdapter());
  assert.deepEqual(await service.find('not-an-id'), { accepted: false, code: 'INVALID_IDENTIFIER' });
  assert.deepEqual(
    await service.find('00000000-0000-4000-8000-000000000099'),
    { accepted: false, code: 'NOT_FOUND' },
  );
});

void test('[IAM-011] conflicting bootstrap identity is rejected without replacing the owner', async () => {
  const repository = new InMemoryIdentityBootstrapRepositoryAdapter();
  const service = new IdentityBootstrapService(repository);
  assert.equal((await service.create(input)).accepted, true);
  const conflict = await service.create({
    ...input,
    user: { ...input.user, displayName: 'Different' },
  });
  assert.deepEqual(conflict, { accepted: false, code: 'BOOTSTRAP_CONFLICT' });
  assert.equal(
    (await repository.findByUserId(stable(input.user.id)))?.user.displayName,
    'Nguyen An',
  );
});

void test('[IAM-001] bootstrap transaction rolls back staged hierarchy', async () => {
  const repository = new InMemoryIdentityBootstrapRepositoryAdapter();
  const validated = bootstrapPersonalOrganizationV1(input);
  assert.equal(validated.accepted, true);
  if (!validated.accepted) return;
  await assert.rejects(
    repository.withTransaction(async (transaction) => {
      await transaction.save(validated.value);
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.equal(
    await repository.findByUserId(stable('00000000-0000-4000-8000-000000000001')),
    undefined,
  );
});
