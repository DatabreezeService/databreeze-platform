import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemoryFolderAutopilotRepositoryAdapter } from '../../../src/features/fa/adapter/in-memory-folder-autopilot-repository.adapter.js';
import {
  FolderAutopilotService,
  type FolderAutopilotDataModePolicyPortV1,
} from '../../../src/features/fa/application/folder-autopilot.service.js';

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

function context(
  scope = {
    scopeType: 'workspace' as const,
    organizationId: ids.organizationId,
    workspaceId: ids.workspaceId,
  },
  idempotencyKey = 'fa-service',
) {
  const result = createIamTenantContextV1({
    actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    correlationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    tenantScope: scope,
    authorizationEpoch: 1,
    idempotencyKey,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context fixture');
  return result.value;
}

const policy: FolderAutopilotDataModePolicyPortV1 = {
  resolveNarrowed: (_context, requested) =>
    Promise.resolve(
      requested === 'LOCAL'
        ? { accepted: true, value: { effectiveDataModePolicyRef: ids.policyVersionId } }
        : { accepted: false, code: 'DATA_MODE_BROADENS_WORKSPACE' },
    ),
};

const profileInput = {
  profileId: ids.profileId,
  version: 1,
  payloadHash: 'a'.repeat(64),
  stabilizationDelayMs: 1_000,
  maxFilesPerScan: 100,
  collisionPolicy: 'REVIEW' as const,
  undoWindowSeconds: 3_600,
  outputLineageEnabled: true,
  createdAt: '2026-08-04T00:00:00.000Z',
};

const bindingInput = (bindingId: string, role: 'INPUT' | 'OUTPUT') => ({
  bindingId,
  deviceGrantId: ids.deviceGrantId,
  role,
  expectedCapabilityDigest: 'b'.repeat(64),
  createdAt: '2026-08-04T00:00:00.000Z',
});

const assignmentInput = {
  assignmentId: ids.recipeId,
  profileId: ids.profileId,
  profileVersion: 1,
  profileHash: 'a'.repeat(64),
  jraRecipeVersionId: ids.recipeId,
  jraRecipeVersionHash: 'c'.repeat(64),
  deviceId: ids.deviceId,
  inputBindingIds: [ids.inputBindingId],
  outputBindingIds: [ids.outputBindingId],
  dataModeConstraint: 'LOCAL' as const,
  idempotencyKey: 'assignment-create-1',
  createdAt: '2026-08-04T00:00:00.000Z',
};

void test('[FA-001..FA-007] service stores profile and binding idempotently without local path data', async () => {
  const service = new FolderAutopilotService(
    new InMemoryFolderAutopilotRepositoryAdapter(),
    policy,
  );
  const tenant = context();
  const profile = await service.createProfile(tenant, profileInput);
  assert.equal(profile.accepted, true);
  const duplicate = await service.createProfile(tenant, profileInput);
  assert.deepEqual(duplicate, profile);
  const binding = await service.createBinding(tenant, bindingInput(ids.inputBindingId, 'INPUT'));
  assert.equal(binding.accepted, true);
  if (binding.accepted) {
    assert.equal('path' in binding.value, false);
    assert.equal('status' in binding.value, false);
  }
});

void test('[FA-014, FA-015, FA-031] assignment validates owned references and rejects a broader mode', async () => {
  const service = new FolderAutopilotService(
    new InMemoryFolderAutopilotRepositoryAdapter(),
    policy,
  );
  const tenant = context();
  await service.createProfile(tenant, profileInput);
  await service.createBinding(tenant, bindingInput(ids.inputBindingId, 'INPUT'));
  await service.createBinding(tenant, bindingInput(ids.outputBindingId, 'OUTPUT'));
  const assignment = await service.createAssignment(tenant, assignmentInput);
  assert.equal(assignment.accepted, true);
  if (assignment.accepted)
    assert.equal(assignment.value.effectiveDataModePolicyRef, ids.policyVersionId);

  const broader = await service.createAssignment(tenant, {
    ...assignmentInput,
    assignmentId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    dataModeConstraint: 'HYBRID',
  });
  assert.deepEqual(broader, { accepted: false, code: 'DATA_MODE_BROADENS_WORKSPACE' });
});

void test('[IAM-019, FA-003] sibling tenant cannot read a profile or assignment', async () => {
  const repository = new InMemoryFolderAutopilotRepositoryAdapter();
  const service = new FolderAutopilotService(repository, policy);
  const tenant = context();
  await service.createProfile(tenant, profileInput);
  const inputBinding = await service.createBinding(
    tenant,
    bindingInput(ids.inputBindingId, 'INPUT'),
  );
  assert.equal(inputBinding.accepted, true);
  const outputBinding = await service.createBinding(
    tenant,
    bindingInput(ids.outputBindingId, 'OUTPUT'),
  );
  assert.equal(outputBinding.accepted, true);
  const assignment = await service.createAssignment(tenant, assignmentInput);
  assert.equal(assignment.accepted, true);
  const ownerRead = await service.findAssignment(tenant, ids.recipeId);
  assert.equal(ownerRead.accepted, true);
  const sibling = context(
    {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    },
    'fa-sibling',
  );
  assert.deepEqual(await service.findProfile(sibling, ids.profileId), {
    accepted: false,
    code: 'FA_PROFILE_NOT_FOUND',
  });
  assert.deepEqual(await service.findAssignment(sibling, ids.recipeId), {
    accepted: false,
    code: 'FA_ASSIGNMENT_NOT_FOUND',
  });
});
