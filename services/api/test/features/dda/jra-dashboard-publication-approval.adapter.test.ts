import assert from 'node:assert/strict';
import test from 'node:test';

import { createApprovalPolicyV1, createApprovalRequestV1 } from '@databreeze/domain/approval/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { JraDashboardPublicationApprovalAdapter } from '../../../src/features/dda/dashboard/adapter/jra-dashboard-publication-approval.adapter.js';
import type { JraApprovalAuthorityPortV1 } from '../../../src/features/jra/application/approval-authority.port.js';

function sid(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
}

const scope = Object.freeze({
  scopeType: 'project' as const,
  organizationId: sid('20000000-0000-4000-8000-000000000001'),
  workspaceId: sid('20000000-0000-4000-8000-000000000002'),
  projectId: sid('20000000-0000-4000-8000-000000000003'),
});
const ids = Object.freeze({
  dashboard: sid('20000000-0000-4000-8000-000000000004'),
  version: sid('20000000-0000-4000-8000-000000000005'),
  policy: sid('20000000-0000-4000-8000-000000000006'),
  request: sid('20000000-0000-4000-8000-000000000007'),
  requester: sid('20000000-0000-4000-8000-000000000008'),
  actor: sid('20000000-0000-4000-8000-000000000009'),
  correlation: sid('20000000-0000-4000-8000-00000000000a'),
});
const canonicalHash = 'd'.repeat(64);

function authorityResult(): Extract<
  Awaited<ReturnType<JraApprovalAuthorityPortV1['findCurrentApproved']>>,
  { accepted: true }
> {
  const request = createApprovalRequestV1({
    requestId: ids.request,
    tenantScope: scope,
    subjectType: 'DASHBOARD_VERSION',
    subjectId: ids.dashboard,
    subjectVersion: 1,
    subjectHash: canonicalHash,
    requestedAction: 'PUBLISH',
    policyId: ids.policy,
    policyVersion: 1,
    requestedBy: ids.requester,
    createdAt: '2026-01-01T00:00:00.000Z',
    dueAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(request.accepted, true);
  if (!request.accepted) throw new Error('invalid DDA approval request');
  const policy = createApprovalPolicyV1({
    policyId: ids.policy,
    workspaceId: scope.workspaceId,
    version: 1,
    actionMatcher: {
      actionType: 'PUBLISH',
      subjectType: 'DASHBOARD_VERSION',
      subjectId: ids.dashboard,
      versionId: ids.version,
      audience: 'WORKSPACE_VIEWERS',
    },
    minimumApprovals: 1,
    eligibleRoles: ['ADMIN'],
    selfApprovalAllowed: false,
    expiresAfterMinutes: 60,
    requireMfa: true,
    status: 'ACTIVE',
  });
  assert.equal(policy.accepted, true);
  if (!policy.accepted) throw new Error('invalid DDA approval policy');
  return {
    accepted: true,
    request: Object.freeze({ ...request.value, status: 'APPROVED' as const, revision: 2 }),
    policy: policy.value,
    validUntil: '2026-01-01T01:00:00.000Z',
  };
}

void test('[DDA-025, JRA-028] adapter maps the server-owned current JRA approval and never trusts a caller approval ID', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const priorVersionCalls: Array<Record<string, unknown>> = [];
  const authority: JraApprovalAuthorityPortV1 = {
    findCurrentApproved: (input) => {
      calls.push({ ...input.binding, subjectId: input.subjectId, subjectHash: input.subjectHash });
      return Promise.resolve(authorityResult());
    },
    invalidateMaterialChange: (input) => {
      calls.push({ ...input.binding, subjectId: input.subjectId, subjectHash: input.subjectHash });
      return Promise.resolve({ accepted: true as const });
    },
    invalidatePriorVersion: (input) => {
      priorVersionCalls.push({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        requestedAction: input.requestedAction,
        priorVersionId: input.priorVersionId,
      });
      return Promise.resolve({ accepted: true as const });
    },
  };
  const adapter = new JraDashboardPublicationApprovalAdapter(authority, {
    now: () => new Date('2026-01-01T00:10:00.000Z'),
  });
  const approval = await adapter.findCurrentPublicationApproval({
    tenantScope: scope,
    dashboardId: ids.dashboard,
    versionId: ids.version,
    canonicalHash,
    audience: 'WORKSPACE_VIEWERS',
  });
  assert.equal(approval.accepted, true);
  if (approval.accepted) {
    assert.equal(approval.value.approvalId, ids.request);
    assert.equal(approval.value.subjectId, ids.dashboard);
    assert.equal(approval.value.versionId, ids.version);
    assert.equal(approval.value.canonicalHash, canonicalHash);
    assert.equal(approval.value.audience, 'WORKSPACE_VIEWERS');
  }
  assert.equal(Object.hasOwn(calls[0] ?? {}, 'approvalId'), false);
  assert.deepEqual(
    await adapter.preparePublicationApprovalInvalidation({
      tenantScope: scope,
      dashboardId: ids.dashboard,
      priorPublishedVersionId: ids.version,
    }),
    {
      accepted: true,
      value: {
        tenantScope: scope,
        dashboardId: ids.dashboard,
        priorPublishedVersionId: ids.version,
      },
    },
  );
  assert.deepEqual(priorVersionCalls, [], 'prepare must not mutate JRA before publication CAS');
  assert.deepEqual(
    await adapter.invalidatePublicationApproval({
      tenantScope: scope,
      dashboardId: ids.dashboard,
      priorPublishedVersionId: ids.version,
    }),
    { accepted: true },
  );
  assert.deepEqual(priorVersionCalls, [
    {
      subjectType: 'DASHBOARD_VERSION',
      subjectId: ids.dashboard,
      requestedAction: 'PUBLISH',
      priorVersionId: ids.version,
    },
  ]);
});

void test('[DDA-025, JRA-011] adapter rejects wrong scope, version, audience, expiry, or unavailable authority', async () => {
  const authority: JraApprovalAuthorityPortV1 = {
    findCurrentApproved: () => Promise.resolve(authorityResult()),
    invalidateMaterialChange: () =>
      Promise.resolve({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    invalidatePriorVersion: () =>
      Promise.resolve({ accepted: false as const, code: 'UNAVAILABLE' as const }),
  };
  const adapter = new JraDashboardPublicationApprovalAdapter(authority, {
    now: () => new Date('2026-01-01T02:00:00.000Z'),
  });
  assert.deepEqual(
    await adapter.findCurrentPublicationApproval({
      tenantScope: { ...scope, projectId: sid('20000000-0000-4000-8000-000000000099') },
      dashboardId: ids.dashboard,
      versionId: ids.version,
      canonicalHash,
      audience: 'WORKSPACE_VIEWERS',
    }),
    { accepted: false, code: 'INVALID' },
  );
  assert.deepEqual(
    await adapter.findCurrentPublicationApproval({
      tenantScope: scope,
      dashboardId: ids.dashboard,
      versionId: '20000000-0000-4000-8000-00000000000b',
      canonicalHash,
      audience: 'WORKSPACE_VIEWERS',
    }),
    { accepted: false, code: 'INVALID' },
  );
  assert.deepEqual(
    await adapter.preparePublicationApprovalInvalidation({
      tenantScope: scope,
      dashboardId: ids.dashboard,
      priorPublishedVersionId: ids.version,
    }),
    {
      accepted: true,
      value: {
        tenantScope: scope,
        dashboardId: ids.dashboard,
        priorPublishedVersionId: ids.version,
      },
    },
  );
  assert.deepEqual(
    await adapter.invalidatePublicationApproval({
      tenantScope: scope,
      dashboardId: ids.dashboard,
      priorPublishedVersionId: ids.version,
    }),
    { accepted: false, code: 'UNAVAILABLE' },
  );
});
