import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
  type WorkspaceTenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryAgentGrantRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-agent-grant-repository.adapter.js';
import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { AccessPresetService } from '../../../src/features/iam/application/access-preset.service.js';
import {
  AGENT_LEVEL_ORDER,
  AgentGrantService,
} from '../../../src/features/iam/application/agent-grant.service.js';
import {
  createIamTenantContextV1,
  type IamTenantContextV1,
} from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000701',
  otherOrganization: '00000000-0000-4000-8000-00000000070d',
  workspace: '00000000-0000-4000-8000-000000000702',
  siblingWorkspace: '00000000-0000-4000-8000-000000000703',
  ownerMember: '00000000-0000-4000-8000-000000000704',
  editorMember: '00000000-0000-4000-8000-000000000705',
  viewerMember: '00000000-0000-4000-8000-000000000706',
  outsider: '00000000-0000-4000-8000-000000000707',
  correlation: '00000000-0000-4000-8000-000000000708',
  grant: '00000000-0000-4000-8000-000000000709',
  dataset: '00000000-0000-4000-8000-00000000070a',
  restrictedDataset: '00000000-0000-4000-8000-00000000070b',
  foreignDataset: '00000000-0000-4000-8000-00000000070c',
};

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid agent grant fixture identifier');
  return parsed.value;
}

function workspaceContext(
  actorId: string,
  key: string,
  workspaceId = ids.workspace,
  authorizationEpoch = 1,
) {
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
  if (!result.accepted) throw new Error('invalid agent grant fixture context');
  return result.value;
}

function seedMemberships() {
  const memberships = new InMemoryIamRepositoryAdapter();
  memberships.seed([
    {
      id: stable(ids.ownerMember),
      principalId: stable(ids.ownerMember),
      scope: {
        scopeType: 'workspace',
        organizationId: stable(ids.organization),
        workspaceId: stable(ids.workspace),
      },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    },
    {
      id: stable(ids.editorMember),
      principalId: stable(ids.editorMember),
      scope: {
        scopeType: 'workspace',
        organizationId: stable(ids.organization),
        workspaceId: stable(ids.workspace),
      },
      roleId: 'analyst',
      status: 'ACTIVE',
      revision: 1,
    },
    {
      id: stable(ids.viewerMember),
      principalId: stable(ids.viewerMember),
      scope: {
        scopeType: 'workspace',
        organizationId: stable(ids.organization),
        workspaceId: stable(ids.workspace),
      },
      roleId: 'viewer',
      status: 'ACTIVE',
      revision: 1,
    },
  ]);
  return memberships;
}

function service() {
  return new AgentGrantService(
    new InMemoryAgentGrantRepositoryAdapter(),
    seedMemberships(),
    new AccessPresetService(),
    () => ids.grant,
    () => new Date('2026-08-12T00:00:00.000Z'),
    {
      validate: () => Promise.resolve({ accepted: true as const }),
    },
  );
}

void test('[IAM-024] agent levels use a monotonic numeric order and never compare raw strings', () => {
  assert.equal(AGENT_LEVEL_ORDER.NONE, 0);
  assert.equal(AGENT_LEVEL_ORDER.ANALYZE, 1);
  assert.equal(AGENT_LEVEL_ORDER.PROPOSE_CHANGES, 2);
  assert.equal(AGENT_LEVEL_ORDER.APPLY_CONFIRMED_CHANGES, 3);
  assert.ok(AGENT_LEVEL_ORDER.ANALYZE > AGENT_LEVEL_ORDER.NONE);
  assert.ok(AGENT_LEVEL_ORDER.PROPOSE_CHANGES > AGENT_LEVEL_ORDER.ANALYZE);
  assert.ok(AGENT_LEVEL_ORDER.APPLY_CONFIRMED_CHANGES > AGENT_LEVEL_ORDER.PROPOSE_CHANGES);
});

void test('[IAM-024] Viewer defaults to NONE and Owner/Editor default to ANALYZE when no grant exists', async () => {
  const grants = service();
  const viewer = await grants.authorize({
    context: workspaceContext(ids.viewerMember, 'viewer-default'),
    memberId: ids.viewerMember,
    requestedLevel: 'ANALYZE',
    resourceIds: [ids.dataset],
  });
  assert.equal(viewer.accepted, true);
  if (!viewer.accepted) return;
  assert.equal(viewer.value.effectiveLevel, 'NONE');
  assert.equal(viewer.value.allowed, false);

  const editor = await grants.authorize({
    context: workspaceContext(ids.editorMember, 'editor-default'),
    memberId: ids.editorMember,
    requestedLevel: 'ANALYZE',
    resourceIds: [ids.dataset],
  });
  assert.equal(editor.accepted, true);
  if (!editor.accepted) return;
  assert.equal(editor.value.effectiveLevel, 'ANALYZE');
  assert.equal(editor.value.allowed, true);

  const owner = await grants.authorize({
    context: workspaceContext(ids.ownerMember, 'owner-default'),
    memberId: ids.ownerMember,
    requestedLevel: 'ANALYZE',
    resourceIds: [ids.dataset],
  });
  assert.equal(owner.accepted, true);
  if (!owner.accepted) return;
  assert.equal(owner.value.effectiveLevel, 'ANALYZE');
  assert.equal(owner.value.allowed, true);
});

void test('[IAM-024] an organization-scoped Owner receives the default analysis grant in its workspace', async () => {
  const memberships = new InMemoryIamRepositoryAdapter();
  memberships.seed([
    {
      id: stable(ids.ownerMember),
      principalId: stable(ids.ownerMember),
      scope: {
        scopeType: 'organization',
        organizationId: stable(ids.organization),
      },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    },
  ]);
  const repository = new InMemoryAgentGrantRepositoryAdapter();
  const context = workspaceContext(ids.ownerMember, 'organization-owner-default');
  const workspaceScope: WorkspaceTenantScopeV1 = {
    scopeType: 'workspace',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
  };
  await repository.saveGrant(
    context,
    {
      id: stable(ids.grant),
      tenantScope: workspaceScope,
      memberId: stable(ids.ownerMember),
      level: 'NONE',
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z' as never,
    },
    1,
  );
  await repository.saveDatasetRestrictions(
    context,
    {
      memberId: stable(ids.ownerMember),
      deniedDatasetIds: [stable(ids.dataset)],
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z' as never,
    },
    1,
  );
  const grants = new AgentGrantService(repository, memberships, new AccessPresetService());

  const decision = await grants.authorize({
    context,
    memberId: ids.ownerMember,
    requestedLevel: 'ANALYZE',
    resourceIds: [ids.dataset],
  });

  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;
  assert.equal(decision.value.effectiveLevel, 'ANALYZE');
  assert.equal(decision.value.allowed, true);
});

void test('[IAM-024] inactive and cross-organization memberships remain unauthorized', async () => {
  const cases = [
    { status: 'SUSPENDED' as const, organizationId: ids.organization },
    { status: 'REMOVED' as const, organizationId: ids.organization },
    { status: 'ACTIVE' as const, organizationId: ids.otherOrganization },
  ];

  for (const candidate of cases) {
    const memberships = new InMemoryIamRepositoryAdapter();
    memberships.seed([
      {
        id: stable(ids.ownerMember),
        principalId: stable(ids.ownerMember),
        scope: {
          scopeType: 'organization',
          organizationId: stable(candidate.organizationId),
        },
        roleId: 'owner',
        status: candidate.status,
        revision: 1,
      },
    ]);
    const grants = new AgentGrantService(
      new InMemoryAgentGrantRepositoryAdapter(),
      memberships,
      new AccessPresetService(),
    );

    assert.deepEqual(
      await grants.authorize({
        context: workspaceContext(ids.ownerMember, `organization-owner-${candidate.status}`),
        memberId: ids.ownerMember,
        requestedLevel: 'ANALYZE',
        resourceIds: [ids.dataset],
      }),
      { accepted: false, code: 'NOT_FOUND' },
    );
  }
});

void test('[IAM-024] Viewer may receive ANALYZE without gaining edit permission', async () => {
  const grants = service();
  const updated = await grants.setMemberGrant(workspaceContext(ids.ownerMember, 'viewer-analyze'), {
    memberId: ids.viewerMember,
    level: 'ANALYZE',
    expectedRevision: 1,
  });
  assert.equal(updated.accepted, true);
  const decision = await grants.authorize({
    context: workspaceContext(ids.viewerMember, 'viewer-analyze-use', ids.workspace, 2),
    memberId: ids.viewerMember,
    requestedLevel: 'ANALYZE',
    resourceIds: [ids.dataset],
  });
  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;
  assert.equal(decision.value.effectiveLevel, 'ANALYZE');
  assert.equal(decision.value.allowed, true);
  assert.equal(decision.value.canMutateDatasets, false);
});

void test('[IAM-024] Editor may be denied agent access with an explicit NONE grant', async () => {
  const grants = service();
  const updated = await grants.setMemberGrant(workspaceContext(ids.ownerMember, 'editor-none'), {
    memberId: ids.editorMember,
    level: 'NONE',
    expectedRevision: 1,
  });
  assert.equal(updated.accepted, true);
  const decision = await grants.authorize({
    context: workspaceContext(ids.editorMember, 'editor-none-use', ids.workspace, 2),
    memberId: ids.editorMember,
    requestedLevel: 'ANALYZE',
    resourceIds: [ids.dataset],
  });
  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;
  assert.equal(decision.value.effectiveLevel, 'NONE');
  assert.equal(decision.value.allowed, false);
});

void test('[IAM-024, DDA-060] PROPOSE_CHANGES cannot apply and APPLY still requires confirmation', async () => {
  const grants = service();
  const updated = await grants.setMemberGrant(workspaceContext(ids.ownerMember, 'propose'), {
    memberId: ids.editorMember,
    level: 'PROPOSE_CHANGES',
    expectedRevision: 1,
  });
  assert.equal(updated.accepted, true);

  const proposeApply = await grants.authorize({
    context: workspaceContext(ids.editorMember, 'propose-apply', ids.workspace, 2),
    memberId: ids.editorMember,
    requestedLevel: 'APPLY_CONFIRMED_CHANGES',
    resourceIds: [ids.dataset],
    confirmationPresent: true,
  });
  assert.equal(proposeApply.accepted, true);
  if (!proposeApply.accepted) return;
  assert.equal(proposeApply.value.effectiveLevel, 'PROPOSE_CHANGES');
  assert.equal(proposeApply.value.allowed, false);

  await grants.setMemberGrant(workspaceContext(ids.ownerMember, 'apply'), {
    memberId: ids.editorMember,
    level: 'APPLY_CONFIRMED_CHANGES',
    expectedRevision: 1,
  });
  const withoutConfirmation = await grants.authorize({
    context: workspaceContext(ids.editorMember, 'apply-no-confirm', ids.workspace, 3),
    memberId: ids.editorMember,
    requestedLevel: 'APPLY_CONFIRMED_CHANGES',
    resourceIds: [ids.dataset],
    confirmationPresent: false,
  });
  assert.equal(withoutConfirmation.accepted, true);
  if (!withoutConfirmation.accepted) return;
  assert.equal(withoutConfirmation.value.allowed, false);
  assert.equal(withoutConfirmation.value.requiresConfirmation, true);

  const withConfirmation = await grants.authorize({
    context: workspaceContext(ids.editorMember, 'apply-confirm', ids.workspace, 3),
    memberId: ids.editorMember,
    requestedLevel: 'APPLY_CONFIRMED_CHANGES',
    resourceIds: [ids.dataset],
    confirmationPresent: true,
  });
  assert.equal(withConfirmation.accepted, true);
  if (!withConfirmation.accepted) return;
  assert.equal(withConfirmation.value.allowed, true);
  assert.equal(withConfirmation.value.effectiveLevel, 'APPLY_CONFIRMED_CHANGES');
});

void test('[IAM-024, DSM-018] restricted datasets return a non-enumerating denial', async () => {
  const grants = service();
  const restricted = await grants.setDatasetRestrictions(
    workspaceContext(ids.ownerMember, 'restrict'),
    {
      memberId: ids.editorMember,
      deniedDatasetIds: [ids.restrictedDataset],
      expectedRevision: 1,
    },
  );
  assert.equal(restricted.accepted, true);
  const decision = await grants.authorize({
    context: workspaceContext(ids.editorMember, 'restrict-use', ids.workspace, 2),
    memberId: ids.editorMember,
    requestedLevel: 'ANALYZE',
    resourceIds: [ids.restrictedDataset],
  });
  assert.deepEqual(decision, { accepted: false, code: 'NOT_FOUND' });

  const projection = await grants.authorize({
    context: workspaceContext(ids.editorMember, 'restrict-projection', ids.workspace, 2),
    memberId: ids.editorMember,
    requestedLevel: 'ANALYZE',
    resourceIds: [],
  });
  assert.equal(projection.accepted, true);
  if (!projection.accepted) return;
  assert.deepEqual(projection.value.deniedDatasetIds, [stable(ids.restrictedDataset)]);
  assert.equal(Object.keys(projection.value).includes('deniedDatasetIds'), false);
  assert.equal(JSON.stringify(projection.value).includes(ids.restrictedDataset), false);
});

void test('[IAM-002, IAM-024] role downgrade takes effect on the next authorization decision', async () => {
  const memberships = seedMemberships();
  const repository = new InMemoryAgentGrantRepositoryAdapter();
  const grants = new AgentGrantService(
    repository,
    memberships,
    new AccessPresetService(),
    () => ids.grant,
    () => new Date('2026-08-12T00:00:00.000Z'),
  );
  await grants.setMemberGrant(workspaceContext(ids.ownerMember, 'downgrade-grant'), {
    memberId: ids.editorMember,
    level: 'APPLY_CONFIRMED_CHANGES',
    expectedRevision: 1,
  });
  const downgradeContext = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
    },
    actorId: stable(ids.ownerMember),
    correlationId: stable(ids.correlation),
    idempotencyKey: 'downgrade-role',
    authorizationEpoch: 1,
    expectedRevision: 1,
  });
  assert.equal(downgradeContext.accepted, true);
  if (!downgradeContext.accepted) return;
  await memberships.saveMembership(downgradeContext.value, {
    id: stable(ids.editorMember),
    principalId: stable(ids.editorMember),
    scope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
    },
    roleId: 'viewer',
    status: 'ACTIVE',
    revision: 2,
  });
  const decision = await grants.authorize({
    context: workspaceContext(ids.editorMember, 'downgrade-use', ids.workspace, 2),
    memberId: ids.editorMember,
    requestedLevel: 'APPLY_CONFIRMED_CHANGES',
    resourceIds: [ids.dataset],
    confirmationPresent: true,
  });
  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;
  assert.equal(decision.value.effectiveLevel, 'ANALYZE');
  assert.equal(decision.value.canMutateDatasets, false);
});

void test('[IAM-024] grants never expand dataset or action permission beyond the member preset', async () => {
  const grants = service();
  const updated = await grants.setMemberGrant(workspaceContext(ids.ownerMember, 'cap'), {
    memberId: ids.viewerMember,
    level: 'APPLY_CONFIRMED_CHANGES',
    expectedRevision: 1,
  });
  assert.equal(updated.accepted, true);
  const decision = await grants.authorize({
    context: workspaceContext(ids.viewerMember, 'cap-use', ids.workspace, 2),
    memberId: ids.viewerMember,
    requestedLevel: 'APPLY_CONFIRMED_CHANGES',
    resourceIds: [ids.dataset],
    confirmationPresent: true,
  });
  assert.equal(decision.accepted, true);
  if (!decision.accepted) return;
  assert.equal(decision.value.effectiveLevel, 'ANALYZE');
  assert.equal(decision.value.canMutateDatasets, false);
  assert.equal(decision.value.allowed, false);
});

void test('[IAM-024, DSM-018] restriction writes canonicalize once, validate targets, and reload durable truth', async () => {
  const repository = new InMemoryAgentGrantRepositoryAdapter();
  const targetCalls: string[][] = [];
  const targetValidator = {
    validate: (...args: readonly [unknown, readonly string[]]) => {
      const datasetIds = args[1];
      targetCalls.push([...datasetIds]);
      return Promise.resolve({ accepted: true as const });
    },
  };
  const grants = new AgentGrantService(
    repository,
    seedMemberships(),
    new AccessPresetService(),
    () => ids.grant,
    () => new Date('2026-08-12T00:00:00.000Z'),
    targetValidator,
  );

  const created = await grants.setDatasetRestrictions(
    workspaceContext(ids.ownerMember, 'canonical-restrictions'),
    {
      memberId: ids.editorMember,
      deniedDatasetIds: [ids.restrictedDataset, ids.dataset, ids.restrictedDataset],
      expectedRevision: 0,
    },
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.deepEqual(created.value.deniedDatasetIds, [
    stable(ids.dataset),
    stable(ids.restrictedDataset),
  ]);
  assert.deepEqual(targetCalls, [[stable(ids.dataset), stable(ids.restrictedDataset)]]);

  const loaded = await grants.getDatasetRestrictions(
    workspaceContext(ids.ownerMember, 'canonical-restrictions-read', ids.workspace, 2),
    { memberId: ids.editorMember },
  );
  assert.deepEqual(loaded, {
    accepted: true,
    value: {
      memberId: stable(ids.editorMember),
      deniedDatasetIds: [stable(ids.dataset), stable(ids.restrictedDataset)],
      revision: 1,
    },
  });
});

void test('[IAM-024, DSM-018] dataset target validation returns safe not-found and unavailable outcomes', async () => {
  const memberships = seedMemberships();
  const repository = new InMemoryAgentGrantRepositoryAdapter();
  const notFound = new AgentGrantService(
    repository,
    memberships,
    new AccessPresetService(),
    () => ids.grant,
    () => new Date('2026-08-12T00:00:00.000Z'),
    {
      validate: () => Promise.resolve({ accepted: false as const, code: 'NOT_FOUND' as const }),
    },
  );
  assert.deepEqual(
    await notFound.setDatasetRestrictions(workspaceContext(ids.ownerMember, 'target-not-found'), {
      memberId: ids.editorMember,
      deniedDatasetIds: [ids.restrictedDataset],
      expectedRevision: 0,
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );

  const unavailable = new AgentGrantService(
    repository,
    memberships,
    new AccessPresetService(),
    () => ids.grant,
    () => new Date('2026-08-12T00:00:00.000Z'),
    {
      validate: () => Promise.resolve({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    },
  );
  assert.deepEqual(
    await unavailable.setDatasetRestrictions(
      workspaceContext(ids.ownerMember, 'target-unavailable'),
      {
        memberId: ids.editorMember,
        deniedDatasetIds: [ids.restrictedDataset],
        expectedRevision: 0,
      },
    ),
    { accepted: false, code: 'UNAVAILABLE' },
  );

  const defaultUnavailable = new AgentGrantService(
    repository,
    memberships,
    new AccessPresetService(),
    () => ids.grant,
    () => new Date('2026-08-12T00:00:00.000Z'),
  );
  assert.deepEqual(
    await defaultUnavailable.setDatasetRestrictions(
      workspaceContext(ids.ownerMember, 'target-default-unavailable'),
      {
        memberId: ids.editorMember,
        deniedDatasetIds: [ids.restrictedDataset],
        expectedRevision: 0,
      },
    ),
    { accepted: false, code: 'UNAVAILABLE' },
  );
});

void test('[IAM-024, DSM-018] target validation rejects foreign-workspace and deleted opaque datasets', async () => {
  const catalog = new Set([`${ids.workspace}:${ids.dataset}`]);
  const validator = {
    validate: (requestContext: IamTenantContextV1, datasetIds: readonly StableIdentifierV1[]) => {
      if (requestContext.tenantScope.scopeType !== 'workspace') {
        return Promise.resolve({ accepted: false as const, code: 'NOT_FOUND' as const });
      }
      const workspaceId = requestContext.tenantScope.workspaceId;
      return Promise.resolve(
        datasetIds.every((datasetId) => catalog.has(`${workspaceId}:${datasetId}`))
          ? { accepted: true as const }
          : { accepted: false as const, code: 'NOT_FOUND' as const },
      );
    },
  };
  const grants = new AgentGrantService(
    new InMemoryAgentGrantRepositoryAdapter(),
    seedMemberships(),
    new AccessPresetService(),
    () => ids.grant,
    () => new Date('2026-08-12T00:00:00.000Z'),
    validator,
  );
  const first = await grants.setDatasetRestrictions(
    workspaceContext(ids.ownerMember, 'target-valid'),
    {
      memberId: ids.editorMember,
      deniedDatasetIds: [ids.dataset],
      expectedRevision: 0,
    },
  );
  assert.equal(first.accepted, true);

  assert.deepEqual(
    await grants.setDatasetRestrictions(workspaceContext(ids.ownerMember, 'target-foreign'), {
      memberId: ids.editorMember,
      deniedDatasetIds: [ids.foreignDataset],
      expectedRevision: 1,
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );

  catalog.delete(`${ids.workspace}:${ids.dataset}`);
  assert.deepEqual(
    await grants.setDatasetRestrictions(workspaceContext(ids.ownerMember, 'target-deleted'), {
      memberId: ids.editorMember,
      deniedDatasetIds: [ids.dataset],
      expectedRevision: 1,
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
});

void test('[IAM-024] an existing effective authority context becomes stale after restriction change', async () => {
  const grants = service();
  const existingSessionContext = workspaceContext(ids.editorMember, 'session-before-restriction');
  const changed = await grants.setDatasetRestrictions(
    workspaceContext(ids.ownerMember, 'session-restriction-change'),
    {
      memberId: ids.editorMember,
      deniedDatasetIds: [ids.restrictedDataset],
      expectedRevision: 0,
    },
  );
  assert.equal(changed.accepted, true);

  assert.deepEqual(
    await grants.authorize({
      context: existingSessionContext,
      memberId: ids.editorMember,
      requestedLevel: 'ANALYZE',
      resourceIds: [],
    }),
    { accepted: false, code: 'STALE_AUTHORIZATION' },
  );
  const freshContext = workspaceContext(
    ids.editorMember,
    'session-after-restriction',
    ids.workspace,
    2,
  );
  const fresh = await grants.authorize({
    context: freshContext,
    memberId: ids.editorMember,
    requestedLevel: 'ANALYZE',
    resourceIds: [],
  });
  assert.equal(fresh.accepted, true);
});
