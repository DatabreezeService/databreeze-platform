import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryAgentGrantRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-agent-grant-repository.adapter.js';
import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { AccessPresetService } from '../../../src/features/iam/application/access-preset.service.js';
import { AgentGrantService } from '../../../src/features/iam/application/agent-grant.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000801',
  workspaceA: '00000000-0000-4000-8000-000000000802',
  workspaceB: '00000000-0000-4000-8000-000000000803',
  memberA: '00000000-0000-4000-8000-000000000804',
  memberB: '00000000-0000-4000-8000-000000000805',
  ownerA: '00000000-0000-4000-8000-000000000806',
  ownerB: '00000000-0000-4000-8000-00000000080a',
  correlation: '00000000-0000-4000-8000-000000000807',
  grant: '00000000-0000-4000-8000-000000000808',
  dataset: '00000000-0000-4000-8000-000000000809',
};

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid tenant isolation identifier');
  return parsed.value;
}

function context(actorId: string, workspaceId: string, key: string, authorizationEpoch = 1) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(workspaceId),
    },
    actorId: stable(actorId),
    correlationId: stable(ids.correlation),
    idempotencyKey: key,
    authorizationEpoch,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid tenant isolation context');
  return result.value;
}

void test('[IAM-009, IAM-019, IAM-024] cross-workspace member and resource IDs resolve as not found', async () => {
  const memberships = new InMemoryIamRepositoryAdapter();
  memberships.seed([
    {
      id: stable(ids.ownerA),
      principalId: stable(ids.ownerA),
      scope: {
        scopeType: 'workspace',
        organizationId: stable(ids.organization),
        workspaceId: stable(ids.workspaceA),
      },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    },
    {
      id: stable(ids.ownerB),
      principalId: stable(ids.ownerB),
      scope: {
        scopeType: 'workspace',
        organizationId: stable(ids.organization),
        workspaceId: stable(ids.workspaceB),
      },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    },
    {
      id: stable(ids.memberA),
      principalId: stable(ids.memberA),
      scope: {
        scopeType: 'workspace',
        organizationId: stable(ids.organization),
        workspaceId: stable(ids.workspaceA),
      },
      roleId: 'analyst',
      status: 'ACTIVE',
      revision: 1,
    },
    {
      id: stable(ids.memberB),
      principalId: stable(ids.memberB),
      scope: {
        scopeType: 'workspace',
        organizationId: stable(ids.organization),
        workspaceId: stable(ids.workspaceB),
      },
      roleId: 'analyst',
      status: 'ACTIVE',
      revision: 1,
    },
  ]);
  const repository = new InMemoryAgentGrantRepositoryAdapter();
  const service = new AgentGrantService(
    repository,
    memberships,
    new AccessPresetService(),
    () => ids.grant,
    () => new Date('2026-08-12T00:00:00.000Z'),
  );

  const created = await service.setMemberGrant(context(ids.ownerA, ids.workspaceA, 'grant-a'), {
    memberId: ids.memberA,
    level: 'ANALYZE',
    expectedRevision: 1,
  });
  assert.equal(created.accepted, true);

  assert.deepEqual(
    await service.authorize({
      context: context(ids.ownerA, ids.workspaceA, 'cross-member', 2),
      memberId: ids.memberB,
      requestedLevel: 'ANALYZE',
      resourceIds: [ids.dataset],
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );

  assert.deepEqual(
    await service.getMemberGrant(context(ids.ownerB, ids.workspaceB, 'cross-workspace-read'), {
      memberId: ids.memberA,
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );

  assert.deepEqual(
    await service.setMemberGrant(context(ids.ownerA, ids.workspaceA, 'cross-workspace-write'), {
      memberId: ids.memberB,
      level: 'ANALYZE',
      expectedRevision: 1,
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
});
