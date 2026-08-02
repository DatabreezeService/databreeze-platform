import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyApprovalDecisionV1,
  createApprovalDecisionV1,
  createApprovalPolicyV1,
  createApprovalRequestV1,
} from '../dist/approval/v1.js';

const ids = {
  policyId: '00000000-0000-4000-8000-000000000001',
  requestId: '00000000-0000-4000-8000-000000000002',
  subjectId: '00000000-0000-4000-8000-000000000003',
  requesterId: '00000000-0000-4000-8000-000000000004',
  approverId: '00000000-0000-4000-8000-000000000005',
  decisionId: '00000000-0000-4000-8000-000000000006',
  workspaceId: '00000000-0000-4000-8000-000000000007',
  organizationId: '00000000-0000-4000-8000-000000000008',
};
const subjectHash = 'a'.repeat(64);

function policy() {
  return createApprovalPolicyV1({
    ...ids,
    version: 1,
    actionMatcher: { actionType: 'spreadsheet.repair' },
    minimumApprovals: 1,
    eligibleRoles: ['OWNER', 'ADMIN'],
    selfApprovalAllowed: false,
    expiresAfterMinutes: 60,
    requireMfa: true,
    status: 'ACTIVE',
  });
}

function request() {
  return createApprovalRequestV1({
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
  });
}

test('[JRA-009, JRA-010, JRA-011, JRA-028] approvals bind subject and require separation plus MFA', () => {
  const createdPolicy = policy();
  const createdRequest = request();
  assert.equal(createdPolicy.accepted && createdRequest.accepted, true);
  if (!createdPolicy.accepted || !createdRequest.accepted) return;
  assert.deepEqual(
    createApprovalDecisionV1({
      decisionId: ids.decisionId,
      request: createdRequest.value,
      actorId: ids.requesterId,
      decision: 'APPROVE',
      subjectHash,
      decidedAt: '2026-01-01T00:01:00.000Z',
      actorRole: 'OWNER',
      selfApprovalAllowed: false,
      requireMfa: true,
    }),
    { accepted: false, code: 'SELF_APPROVAL_FORBIDDEN' },
  );
  const decision = createApprovalDecisionV1({
    decisionId: ids.decisionId,
    request: createdRequest.value,
    actorId: ids.approverId,
    decision: 'APPROVE',
    subjectHash,
    mfaAssertionId: '00000000-0000-4000-8000-000000000009',
    decidedAt: '2026-01-01T00:01:00.000Z',
    actorRole: 'ADMIN',
    selfApprovalAllowed: false,
    requireMfa: true,
  });
  assert.equal(decision.accepted, true);
  if (decision.accepted) {
    const approved = applyApprovalDecisionV1(createdRequest.value, decision.value, 1, 1);
    assert.equal(approved.accepted, true);
    if (approved.accepted) assert.equal(approved.value.status, 'APPROVED');
  }
});
