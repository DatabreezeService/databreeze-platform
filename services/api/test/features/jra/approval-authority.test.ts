import assert from 'node:assert/strict';
import test from 'node:test';

import { createApprovalPolicyV1, createApprovalRequestV1 } from '@databreeze/domain/approval/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryApprovalRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-approval-repository.adapter.js';
import { ApprovalService } from '../../../src/features/jra/application/approval.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = Object.freeze({
  organization: '10000000-0000-4000-8000-000000000001',
  workspace: '10000000-0000-4000-8000-000000000002',
  project: '10000000-0000-4000-8000-000000000003',
  otherProject: '10000000-0000-4000-8000-000000000004',
  dashboard: '10000000-0000-4000-8000-000000000005',
  version: '10000000-0000-4000-8000-000000000006',
  oldVersion: '10000000-0000-4000-8000-000000000007',
  policy: '10000000-0000-4000-8000-000000000008',
  oldPolicy: '10000000-0000-4000-8000-000000000009',
  request: '10000000-0000-4000-8000-000000000010',
  oldRequest: '10000000-0000-4000-8000-000000000011',
  requester: '10000000-0000-4000-8000-000000000012',
  approver: '10000000-0000-4000-8000-000000000013',
  actor: '10000000-0000-4000-8000-000000000014',
  correlation: '10000000-0000-4000-8000-000000000015',
  mfa: '10000000-0000-4000-8000-000000000016',
});

const currentHash = 'b'.repeat(64);
const oldHash = 'c'.repeat(64);

function sid(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid authority test identifier');
  return parsed.value;
}

function context(projectId: string, key: string) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'project',
      organizationId: ids.organization,
      workspaceId: ids.workspace,
      projectId,
    },
    actorId: ids.actor,
    correlationId: ids.correlation,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid authority context');
  return result.value;
}

function workspaceContext(key: string) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organization,
      workspaceId: ids.workspace,
    },
    actorId: ids.actor,
    correlationId: ids.correlation,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid workspace context');
  return result.value;
}

function policy(
  policyId: string,
  versionId: string,
  audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS',
) {
  const result = createApprovalPolicyV1({
    policyId,
    workspaceId: ids.workspace,
    version: 1,
    actionMatcher: {
      actionType: 'PUBLISH',
      subjectType: 'DASHBOARD_VERSION',
      subjectId: ids.dashboard,
      versionId,
      audience,
    },
    minimumApprovals: 1,
    eligibleRoles: ['ADMIN'],
    selfApprovalAllowed: false,
    expiresAfterMinutes: 60,
    requireMfa: true,
    status: 'ACTIVE',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid authority policy');
  return result.value;
}

function request(
  requestId: string,
  policyId: string,
  versionHash: string,
  createdAt = '2026-01-01T00:00:00.000Z',
) {
  const result = createApprovalRequestV1({
    requestId,
    tenantScope: context(ids.project, `request-${requestId}`).tenantScope,
    subjectType: 'DASHBOARD_VERSION',
    subjectId: sid(ids.dashboard),
    subjectVersion: 1,
    subjectHash: versionHash,
    requestedAction: 'PUBLISH',
    policyId,
    policyVersion: 1,
    requestedBy: ids.requester,
    createdAt,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid authority request');
  return result.value;
}

void test('[JRA-009, JRA-010, JRA-011, JRA-028] public JRA authority maps only the current exact dashboard publication approval', async () => {
  const service = new ApprovalService(new InMemoryApprovalRepositoryAdapter(), {
    clock: () => new Date('2026-01-01T00:10:00.000Z'),
  });
  const project = context(ids.project, 'authority-current');
  assert.equal(
    (
      await service.publishPolicy(
        workspaceContext('authority-policy'),
        policy(ids.policy, ids.version, 'WORKSPACE_VIEWERS'),
      )
    ).accepted,
    true,
  );
  assert.equal(
    (await service.openRequest(project, request(ids.request, ids.policy, currentHash))).accepted,
    true,
  );
  const decision = await service.decide(project, {
    requestId: sid(ids.request),
    decisionId: sid('10000000-0000-4000-8000-000000000017'),
    actorId: sid(ids.approver),
    decision: 'APPROVE',
    subjectHash: currentHash,
    decidedAt: '2026-01-01T00:02:00.000Z',
    actorRole: 'ADMIN',
    mfaAssertionId: sid(ids.mfa),
  });
  assert.equal(decision.accepted, true);

  const current = await service.findCurrentApproved({
    tenantScope: project.tenantScope,
    subjectType: 'DASHBOARD_VERSION',
    subjectId: sid(ids.dashboard),
    subjectHash: currentHash,
    requestedAction: 'PUBLISH',
    binding: { versionId: ids.version, audience: 'WORKSPACE_VIEWERS' },
  });
  assert.equal(current.accepted, true);
  if (current.accepted) {
    assert.equal(current.request.requestId, ids.request);
    assert.equal(current.policy.actionMatcher['audience'], 'WORKSPACE_VIEWERS');
    assert.equal(current.validUntil, '2026-01-01T01:00:00.000Z');
  }

  assert.deepEqual(
    await service.findCurrentApproved({
      tenantScope: project.tenantScope,
      subjectType: 'DASHBOARD_VERSION',
      subjectId: sid(ids.dashboard),
      subjectHash: currentHash,
      requestedAction: 'PUBLISH',
      binding: { versionId: ids.version, audience: 'OWNER' },
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
  assert.deepEqual(
    await service.findCurrentApproved({
      tenantScope: context(ids.otherProject, 'authority-cross-project').tenantScope,
      subjectType: 'DASHBOARD_VERSION',
      subjectId: sid(ids.dashboard),
      subjectHash: currentHash,
      requestedAction: 'PUBLISH',
      binding: { versionId: ids.version, audience: 'WORKSPACE_VIEWERS' },
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
});

void test('[JRA-011, DDA-025] material change invalidation cancels prior publication approvals durably', async () => {
  const repository = new InMemoryApprovalRepositoryAdapter();
  const service = new ApprovalService(repository, {
    clock: () => new Date('2026-01-01T00:10:00.000Z'),
  });
  const project = context(ids.project, 'authority-invalidate');
  assert.equal(
    (
      await service.publishPolicy(
        workspaceContext('authority-old-policy'),
        policy(ids.oldPolicy, ids.oldVersion, 'WORKSPACE_VIEWERS'),
      )
    ).accepted,
    true,
  );
  assert.equal(
    (await service.openRequest(project, request(ids.oldRequest, ids.oldPolicy, oldHash))).accepted,
    true,
  );
  const approved = await service.decide(project, {
    requestId: sid(ids.oldRequest),
    decisionId: sid('10000000-0000-4000-8000-000000000018'),
    actorId: sid(ids.approver),
    decision: 'APPROVE',
    subjectHash: oldHash,
    decidedAt: '2026-01-01T00:02:00.000Z',
    actorRole: 'ADMIN',
    mfaAssertionId: sid(ids.mfa),
  });
  assert.equal(approved.accepted, true);

  assert.deepEqual(
    await service.invalidateMaterialChange({
      tenantScope: project.tenantScope,
      subjectType: 'DASHBOARD_VERSION',
      subjectId: sid(ids.dashboard),
      requestedAction: 'PUBLISH',
      subjectHash: currentHash,
      binding: { versionId: ids.version },
    }),
    { accepted: true },
  );
  assert.deepEqual(
    await service.findCurrentApproved({
      tenantScope: project.tenantScope,
      subjectType: 'DASHBOARD_VERSION',
      subjectId: sid(ids.dashboard),
      subjectHash: oldHash,
      requestedAction: 'PUBLISH',
      binding: { versionId: ids.oldVersion, audience: 'WORKSPACE_VIEWERS' },
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
});

void test('[JRA-009, JRA-011] expired approval requests are not current after restart', async () => {
  const repository = new InMemoryApprovalRepositoryAdapter();
  const service = new ApprovalService(repository, {
    clock: () => new Date('2026-01-01T02:00:00.000Z'),
  });
  const currentPolicy = policy(ids.policy, ids.version, 'OWNER');
  assert.equal(
    (await service.publishPolicy(workspaceContext('authority-expired-policy'), currentPolicy))
      .accepted,
    true,
  );
  assert.equal(
    (
      await service.openRequest(
        context(ids.project, 'authority-expired-request'),
        request(ids.request, ids.policy, currentHash),
      )
    ).accepted,
    true,
  );
  assert.deepEqual(
    await service.findCurrentApproved({
      tenantScope: context(ids.project, 'authority-expired-lookup').tenantScope,
      subjectType: 'DASHBOARD_VERSION',
      subjectId: sid(ids.dashboard),
      subjectHash: currentHash,
      requestedAction: 'PUBLISH',
      binding: { versionId: ids.version, audience: 'OWNER' },
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
});
