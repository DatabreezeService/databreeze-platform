import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryApprovalRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-approval-repository.adapter.js';
import { ApprovalService } from '../../../src/features/jra/application/approval.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000010';
const requesterId = '00000000-0000-4000-8000-000000000011';
const approverId = '00000000-0000-4000-8000-000000000012';
const correlationId = '00000000-0000-4000-8000-000000000013';
const policyId = '00000000-0000-4000-8000-000000000020';
const requestId = '00000000-0000-4000-8000-000000000021';
const subjectId = '00000000-0000-4000-8000-000000000022';
const decisionId = '00000000-0000-4000-8000-000000000024';
const changedDecisionId = '00000000-0000-4000-8000-000000000025';
const subjectHash = 'a'.repeat(64);

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

const ids = {
  organizationId: stable(organizationId),
  workspaceId: stable(workspaceId),
  actorId: stable(actorId),
  requesterId: stable(requesterId),
  approverId: stable(approverId),
  correlationId: stable(correlationId),
  policyId: stable(policyId),
  requestId: stable(requestId),
  subjectId: stable(subjectId),
  decisionId: stable(decisionId),
  changedDecisionId: stable(changedDecisionId),
};

function context(key: string) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: ids.workspaceId,
    },
    actorId: ids.actorId,
    correlationId: ids.correlationId,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function policyInput() {
  return {
    policyId: ids.policyId,
    workspaceId: ids.workspaceId,
    version: 1,
    actionMatcher: { actionType: 'spreadsheet.repair' },
    minimumApprovals: 1,
    eligibleRoles: ['ADMIN'],
    selfApprovalAllowed: false,
    expiresAfterMinutes: 60,
    requireMfa: true,
    status: 'ACTIVE' as const,
  };
}

function requestInput() {
  return {
    requestId: ids.requestId,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: ids.workspaceId,
    },
    subjectType: 'REPAIR_PLAN',
    subjectId: ids.subjectId,
    subjectVersion: 1,
    subjectHash,
    requestedAction: 'APPLY_REPAIR',
    policyId: ids.policyId,
    policyVersion: 1,
    requestedBy: ids.requesterId,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

void test('[JRA-009, JRA-010, JRA-011, JRA-028] service publishes, opens, and approves one subject-bound request', async () => {
  const service = new ApprovalService(new InMemoryApprovalRepositoryAdapter());
  assert.equal((await service.publishPolicy(context('policy'), policyInput())).accepted, true);
  const opened = await service.openRequest(context('request'), requestInput());
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  const approved = await service.decide(context('decision'), {
    requestId: ids.requestId,
    decisionId: ids.decisionId,
    actorId: ids.approverId,
    decision: 'APPROVE',
    subjectHash,
    mfaAssertionId: '00000000-0000-4000-8000-000000000023',
    decidedAt: '2026-01-01T00:01:00.000Z',
    actorRole: 'ADMIN',
  });
  assert.equal(approved.accepted, true);
  if (approved.accepted) assert.equal(approved.value.request.status, 'APPROVED');
});

void test('[JRA-010, JRA-011] self-approval and changed subject are rejected', async () => {
  const service = new ApprovalService(new InMemoryApprovalRepositoryAdapter());
  await service.publishPolicy(context('policy-self'), policyInput());
  await service.openRequest(context('request-self'), requestInput());
  assert.deepEqual(
    await service.decide(context('self'), {
      requestId: ids.requestId,
      decisionId: ids.decisionId,
      actorId: ids.requesterId,
      decision: 'APPROVE',
      subjectHash,
      mfaAssertionId: '00000000-0000-4000-8000-000000000023',
      decidedAt: '2026-01-01T00:01:00.000Z',
      actorRole: 'ADMIN',
    }),
    { accepted: false, code: 'SELF_APPROVAL_FORBIDDEN' },
  );
  assert.deepEqual(
    await service.decide(context('changed'), {
      requestId: ids.requestId,
      decisionId: ids.changedDecisionId,
      actorId: ids.approverId,
      decision: 'APPROVE',
      subjectHash: 'b'.repeat(64),
      mfaAssertionId: '00000000-0000-4000-8000-000000000023',
      decidedAt: '2026-01-01T00:01:00.000Z',
      actorRole: 'ADMIN',
    }),
    { accepted: false, code: 'SUBJECT_HASH_MISMATCH' },
  );
});
