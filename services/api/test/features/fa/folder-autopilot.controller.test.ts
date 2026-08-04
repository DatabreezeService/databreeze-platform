import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemoryFolderAutopilotRepositoryAdapter } from '../../../src/features/fa/adapter/in-memory-folder-autopilot-repository.adapter.js';
import type { FolderAutopilotDataModePolicyPortV1 } from '../../../src/features/fa/application/folder-autopilot.service.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const ids = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  profileId: '33333333-3333-4333-8333-333333333333',
  inputBindingId: '44444444-4444-4444-8444-444444444444',
  outputBindingId: '55555555-5555-4555-8555-555555555555',
  deviceGrantId: '66666666-6666-4666-8666-666666666666',
  deviceId: '77777777-7777-4777-8777-777777777777',
  recipeId: '88888888-8888-4888-8888-888888888888',
  policyVersionId: '99999999-9999-4999-8999-999999999999',
};

function context(workspaceId = ids.workspaceId, idempotencyKey = 'fa-http') {
  const result = createIamTenantContextV1({
    actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    correlationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    tenantScope: { scopeType: 'workspace', organizationId: ids.organizationId, workspaceId },
    authorizationEpoch: 1,
    idempotencyKey,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context fixture');
  return result.value;
}

const profile = {
  profileId: ids.profileId,
  version: 1,
  payloadHash: 'a'.repeat(64),
  stabilizationDelayMs: 1_000,
  maxFilesPerScan: 100,
  collisionPolicy: 'REVIEW',
  undoWindowSeconds: 3_600,
  outputLineageEnabled: true,
  createdAt: '2026-08-04T00:00:00.000Z',
};

const policy: FolderAutopilotDataModePolicyPortV1 = {
  resolveNarrowed: async (_context, requested) =>
    requested === 'LOCAL'
      ? { accepted: true, value: { effectiveDataModePolicyRef: ids.policyVersionId } }
      : { accepted: false, code: 'DATA_MODE_BROADENS_WORKSPACE' },
};

void test('[FA-001..FA-007, FA-014, FA-015, FA-031] HTTP is tenant-scoped and content-free', async () => {
  let current = context();
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(current),
  };
  const repository = new InMemoryFolderAutopilotRepositoryAdapter();
  const { app } = await createApiApplication({
    requestTenantContext,
    folderAutopilotRepository: repository,
    folderAutopilotDataModePolicy: policy,
  });
  try {
    const rejectedUnknown = await app.inject({
      method: 'POST',
      url: '/v1/autopilot-profiles',
      payload: { ...profile, tenantScope: current.tenantScope, path: 'C:\\secret' },
    });
    assert.equal(rejectedUnknown.statusCode, 400);

    const createdProfile = await app.inject({
      method: 'POST',
      url: '/v1/autopilot-profiles',
      payload: profile,
    });
    assert.equal(createdProfile.statusCode, 201);
    assert.equal(createdProfile.json().accepted, true);

    for (const [bindingId, role] of [
      [ids.inputBindingId, 'INPUT'],
      [ids.outputBindingId, 'OUTPUT'],
    ] as const) {
      const createdBinding = await app.inject({
        method: 'POST',
        url: '/v1/autopilot-folder-bindings',
        payload: {
          bindingId,
          deviceGrantId: ids.deviceGrantId,
          role,
          expectedCapabilityDigest: 'b'.repeat(64),
          createdAt: profile.createdAt,
        },
      });
      assert.equal(createdBinding.statusCode, 201);
      assert.equal(createdBinding.json().accepted, true);
    }

    const createdAssignment = await app.inject({
      method: 'POST',
      url: '/v1/autopilot-assignments',
      payload: {
        assignmentId: ids.recipeId,
        profileId: ids.profileId,
        profileVersion: 1,
        profileHash: profile.payloadHash,
        jraRecipeVersionId: ids.recipeId,
        jraRecipeVersionHash: 'c'.repeat(64),
        deviceId: ids.deviceId,
        inputBindingIds: [ids.inputBindingId],
        outputBindingIds: [ids.outputBindingId],
        dataModeConstraint: 'LOCAL',
        createdAt: profile.createdAt,
      },
    });
    assert.equal(createdAssignment.statusCode, 201);
    assert.equal(createdAssignment.json().value.effectiveDataModePolicyRef, ids.policyVersionId);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/v1/autopilot-assignments/${ids.recipeId}`,
      payload: { expectedRevision: 1, state: 'ACTIVE' },
    });
    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().value.revision, 2);

    const dashboard = await app.inject({ method: 'GET', url: '/v1/autopilot-dashboard' });
    assert.equal(dashboard.statusCode, 200);
    assert.equal(dashboard.json().accepted, true);
    assert.equal(Array.isArray(dashboard.json().value.assignments), true);

    const pause = await app.inject({
      method: 'POST',
      url: `/v1/autopilot-assignments/${ids.recipeId}/pause`,
      payload: { expectedRevision: 2 },
    });
    assert.equal(pause.statusCode, 200);
    assert.equal(pause.json().value.state, 'PAUSED');

    const approvalUnavailable = await app.inject({
      method: 'POST',
      url: `/v1/autopilot-approvals/${ids.recipeId}/decision`,
      payload: {
        jraApprovalRequestId: ids.recipeId,
        subjectHash: 'd'.repeat(64),
        planHash: 'e'.repeat(64),
        decision: 'APPROVE',
        decisionReason: 'Ready for the JRA approval service.',
      },
    });
    assert.equal(approvalUnavailable.statusCode, 200);
    assert.deepEqual(approvalUnavailable.json(), {
      accepted: false,
      code: 'FA_JRA_APPROVAL_FACADE_UNAVAILABLE',
    });

    const undoUnavailable = await app.inject({
      method: 'POST',
      url: `/v1/autopilot-executions/${ids.recipeId}/undo`,
      payload: { expectedRevision: 1, planHash: 'e'.repeat(64) },
    });
    assert.equal(undoUnavailable.statusCode, 200);
    assert.deepEqual(undoUnavailable.json(), {
      accepted: false,
      code: 'FA_JRA_UNDO_FACADE_UNAVAILABLE',
    });

    current = context('ffffffff-ffff-4fff-8fff-ffffffffffff', 'fa-sibling');
    const siblingRead = await app.inject({
      method: 'GET',
      url: `/v1/autopilot-profiles/${ids.profileId}`,
    });
    assert.equal(siblingRead.statusCode, 200);
    assert.deepEqual(siblingRead.json(), { accepted: false, code: 'FA_PROFILE_NOT_FOUND' });
  } finally {
    await app.close();
  }
});
