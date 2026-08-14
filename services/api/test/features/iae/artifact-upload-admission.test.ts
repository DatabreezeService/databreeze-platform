import assert from 'node:assert/strict';
import test from 'node:test';

import { createArtifactVersionV1 } from '@databreeze/domain/artifact/v1';
import { createInboxItemV1 } from '@databreeze/domain/artifact-intake/v1';
import { createDataModePolicyVersionV1 } from '@databreeze/domain/data-mode/v1';

import { RootArtifactUploadAdmissionAdapter } from '../../../src/platform/iae-artifact-upload-admission.composition.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 7,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'upload-admission',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const versionResult = createArtifactVersionV1({
  artifactId: '55555555-5555-4555-8555-555555555555',
  versionId: '66666666-6666-4666-8666-666666666666',
  tenantScope: context.tenantScope,
  sourceKind: 'FILE',
  dataMode: 'Hybrid',
  contentSha256: 'a'.repeat(64),
  byteSize: 8 * 1024 * 1024,
  mediaType: 'application/octet-stream',
  displayName: 'fixture.bin',
  createdAt: '2026-08-13T00:00:00.000Z',
  status: 'QUARANTINED',
  scanState: 'PENDING',
});
if (!versionResult.accepted) throw new Error('fixture version invalid');
const version = versionResult.value;

const intakeResult = createInboxItemV1({
  inboxItemId: '77777777-7777-4777-8777-777777777777',
  tenantScope: context.tenantScope,
  idempotencyKey: 'upload-admission-intake',
  artifactVersionId: version.versionId,
  createdAt: '2026-08-13T00:00:00.000Z',
});
if (!intakeResult.accepted) throw new Error('fixture intake invalid');
const intake = intakeResult.value;

function policy(mode: 'LOCAL' | 'HYBRID' | 'CLOUD') {
  const result = createDataModePolicyVersionV1({
    policyId: '88888888-8888-4888-8888-888888888888',
    policyVersionId: '99999999-9999-4999-8999-999999999999',
    organizationId: context.tenantScope.organizationId,
    workspaceId:
      context.tenantScope.scopeType === 'workspace' ? context.tenantScope.workspaceId : undefined,
    revision: 1,
    mode,
    allowedPayloadClasses: {
      PUBLIC: ['CONTROL_METADATA', 'ORIGINAL_CONTENT'],
      INTERNAL: ['CONTROL_METADATA', 'ORIGINAL_CONTENT'],
      CONFIDENTIAL: ['CONTROL_METADATA', 'ORIGINAL_CONTENT'],
      RESTRICTED: ['CONTROL_METADATA', 'ORIGINAL_CONTENT'],
    },
    allowedPlacementKinds: ['CLOUD_OBJECT'],
    allowedExecutorClasses: [],
    allowedDestinationClasses: [],
    canonicalHash: 'b'.repeat(64),
    publishedAt: '2026-08-13T00:00:00.000Z',
  });
  if (!result.accepted) throw new Error('fixture policy invalid');
  return result.value;
}

function admission(mode: 'LOCAL' | 'HYBRID' | 'CLOUD') {
  return new RootArtifactUploadAdmissionAdapter({
    authorization: { authorize: () => Promise.resolve({ accepted: true, value: true }) },
    intakes: { find: () => Promise.resolve(intake) },
    artifacts: { findVersion: () => Promise.resolve(version) },
    policies: {
      resolveCurrentWorkspacePolicy: () =>
        Promise.resolve({ policy: policy(mode), authorizationEpoch: context.authorizationEpoch }),
    },
    maxWorkspaceUploadBytes: 20 * 1024 * 1024 * 1024,
  });
}

void test('[IAE-004][IAE-022] upload admission binds exact intake/version and rejects LOCAL policy', async () => {
  const declaration = {
    intakeId: intake.inboxItemId,
    expectedSha256: version.contentSha256,
    expectedByteSize: version.byteSize,
    mediaType: version.mediaType,
    requestedPartSize: 8 * 1024 * 1024,
  } as const;

  assert.deepEqual(await admission('LOCAL').admitCreate(context, declaration), {
    accepted: false,
    code: 'UPLOAD_DATA_MODE_DENIED',
  });
  const accepted = await admission('HYBRID').admitCreate(context, declaration);
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  assert.equal(accepted.value.artifactId, version.artifactId);
  assert.equal(accepted.value.artifactVersionId, version.versionId);
  assert.equal(accepted.value.intakeId, intake.inboxItemId);
  assert.equal(accepted.value.policyVersionId, policy('HYBRID').policyVersionId);
  assert.equal(accepted.value.authorizationEpoch, context.authorizationEpoch);
});

void test('[IAE-009][IAE-022] upload admission rejects metadata, size-policy, and permission mismatches', async () => {
  const adapter = admission('CLOUD');
  const base = {
    intakeId: intake.inboxItemId,
    expectedSha256: version.contentSha256,
    expectedByteSize: version.byteSize,
    mediaType: version.mediaType,
    requestedPartSize: 8 * 1024 * 1024,
  } as const;
  assert.deepEqual(await adapter.admitCreate(context, { ...base, expectedSha256: 'f'.repeat(64) }), {
    accepted: false,
    code: 'UPLOAD_ARTIFACT_MISMATCH',
  });
  assert.deepEqual(await adapter.admitCreate(context, { ...base, requestedPartSize: 1024 }), {
    accepted: false,
    code: 'UPLOAD_SIZE_POLICY_DENIED',
  });
  const denied = new RootArtifactUploadAdmissionAdapter({
    authorization: {
      authorize: () => Promise.resolve({ accepted: false, code: 'PERMISSION_DENIED' }),
    },
    intakes: { find: () => Promise.resolve(intake) },
    artifacts: { findVersion: () => Promise.resolve(version) },
    policies: { resolveCurrentWorkspacePolicy: () => Promise.resolve(undefined) },
    maxWorkspaceUploadBytes: 20 * 1024 * 1024 * 1024,
  });
  assert.deepEqual(await denied.admitCreate(context, base), {
    accepted: false,
    code: 'UPLOAD_PERMISSION_DENIED',
  });
});
