import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryAgentGrantRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-agent-grant-repository.adapter.js';
import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { AccessPresetService } from '../../../src/features/iam/application/access-preset.service.js';
import {
  AGENT_LEVEL_ORDER,
  AgentGrantService,
} from '../../../src/features/iam/application/agent-grant.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000701',
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
};

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid agent grant fixture identifier');
  return parsed.value;
}

function workspaceContext(actorId: string, key: string, workspaceId = ids.workspace) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(workspaceId),
    },
    actorId: stable(actorId),
    correlationId: stable(ids.correlation),
    idempotencyKey: key,
    authorizationEpoch: 1,
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

void test('[IAM-024] Viewer may receive ANALYZE without gaining edit permission', async () => {
  const grants = service();
  const updated = await grants.setMemberGrant(workspaceContext(ids.ownerMember, 'viewer-analyze'), {
    memberId: ids.viewerMember,
    level: 'ANALYZE',
    expectedRevision: 1,
  });
  assert.equal(updated.accepted, true);
  const decision = await grants.authorize({
    context: workspaceContext(ids.viewerMember, 'viewer-analyze-use'),
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
    context: workspaceContext(ids.editorMember, 'editor-none-use'),
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
    context: workspaceContext(ids.editorMember, 'propose-apply'),
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
    context: workspaceContext(ids.editorMember, 'apply-no-confirm'),
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
    context: workspaceContext(ids.editorMember, 'apply-confirm'),
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
    context: workspaceContext(ids.editorMember, 'restrict-use'),
    memberId: ids.editorMember,
    requestedLevel: 'ANALYZE',
    resourceIds: [ids.restrictedDataset],
  });
  assert.deepEqual(decision, { accepted: false, code: 'NOT_FOUND' });
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
    context: workspaceContext(ids.editorMember, 'downgrade-use'),
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
    context: workspaceContext(ids.viewerMember, 'cap-use'),
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
