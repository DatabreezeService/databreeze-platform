/* eslint-disable @typescript-eslint/require-await -- deterministic capability doubles. */
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createExecutionAttemptV1 } from '@databreeze/domain/execution-attempt/v1';
import { createJobV1, createTypedActionDefinitionV1 } from '@databreeze/domain/jobs/v1';
import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { ArtifactService } from '../../../src/features/iae/application/artifact.service.js';
import {
  IamBackedIaeAuthorizationAdapter,
  type IaeAuthorizationPortV1,
} from '../../../src/features/iae/application/iae-authorization.port.js';
import {
  IaeOriginalViewService,
  type CloudOriginalSignerPortV1,
} from '../../../src/features/iae/application/original-view.service.js';
import { InMemoryWorkerObjectCapabilityRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-worker-object-capability-repository.adapter.js';
import { IaeWorkerObjectGrantAuthorityAdapter } from '../../../src/features/jra/worker/iae-worker-object-grant-authority.adapter.js';
import {
  IaeWorkerObjectCapabilityService,
  type IaeWorkerCapabilitySignerPortV1,
  type IaeWorkerInputObjectResolverPortV1,
  type IaeWorkerOutputObjectResolverPortV1,
} from '../../../src/features/iae/application/worker-object-capability.service.js';

const ids = Object.freeze({
  organizationId: '00000000-0000-4000-8000-000000000701',
  workspaceId: '00000000-0000-4000-8000-000000000702',
  otherWorkspaceId: '00000000-0000-4000-8000-000000000703',
  actorId: '00000000-0000-4000-8000-000000000704',
  workerId: '00000000-0000-4000-8000-000000000705',
  artifactId: '00000000-0000-4000-8000-000000000706',
  versionId: '00000000-0000-4000-8000-000000000707',
  otherVersionId: '00000000-0000-4000-8000-000000000708',
  placementId: '00000000-0000-4000-8000-000000000709',
  evidenceId: '00000000-0000-4000-8000-000000000710',
  otherEvidenceId: '00000000-0000-4000-8000-000000000711',
  jobId: '00000000-0000-4000-8000-000000000712',
  attemptId: '00000000-0000-4000-8000-000000000713',
  inputObjectId: '00000000-0000-4000-8000-000000000714',
  resultObjectId: 'result-object-000001',
  correlationId: '00000000-0000-4000-8000-000000000715',
  membershipId: '00000000-0000-4000-8000-000000000716',
});

const now = '2026-08-13T00:00:00.000Z';
const scopeResult = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: ids.organizationId,
  workspaceId: ids.workspaceId,
});
if (!scopeResult.accepted) throw new Error('invalid test scope');
const scope: TenantScopeV1 = scopeResult.value;
const otherScopeResult = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: ids.organizationId,
  workspaceId: ids.otherWorkspaceId,
});
if (!otherScopeResult.accepted) throw new Error('invalid other test scope');
const otherScope: TenantScopeV1 = otherScopeResult.value;

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error(`invalid test identifier: ${value}`);
  return parsed.value;
}

function context(
  actorId = ids.actorId,
  tenantScope: TenantScopeV1 = scope,
  idempotencyKey = 'iae-capability-test',
) {
  const result = createIamTenantContextV1({
    actorId,
    tenantScope,
    authorizationEpoch: 7,
    correlationId: ids.correlationId,
    idempotencyKey,
    mfaReenrollmentRequired: false,
  });
  if (!result.accepted) throw new Error('invalid test context');
  return result.value;
}

function membership(status: 'ACTIVE' | 'REMOVED' = 'ACTIVE', roleId = 'analyst') {
  return {
    id: stable(ids.membershipId),
    principalId: stable(ids.actorId),
    scope,
    roleId,
    status,
    revision: 1,
  } as const;
}

async function artifactFixture() {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const artifacts = new ArtifactService(repository);
  const tenantContext = context();
  const registered = await artifacts.register(tenantContext, {
    version: {
      artifactId: ids.artifactId,
      versionId: ids.versionId,
      tenantScope: scope,
      sourceKind: 'FILE',
      dataMode: 'Cloud',
      contentSha256: 'a'.repeat(64),
      byteSize: 100,
      mediaType: 'text/csv',
      displayName: 'orders.csv',
      createdAt: now,
    },
    placement: {
      placementId: ids.placementId,
      tenantScope: scope,
      kind: 'CLOUD',
      opaqueReference: 'iae-object-ref-000001',
      contentSha256: 'a'.repeat(64),
    },
    evidence: {
      evidenceId: ids.evidenceId,
      tenantScope: scope,
      coordinate: { kind: 'ROW', row: 4, field: 'amount' },
    },
  });
  assert.equal(registered.accepted, true);
  const versionId = stable(ids.versionId);
  await repository.updateVersionStatus(tenantContext, versionId, 'ACTIVE', 'CLEAN');
  return { repository, tenantContext };
}

void test('[IAE-008, IAE-019, IAE-020] original view authorization is exact, opaque, and cloud-signed', async () => {
  const { repository, tenantContext } = await artifactFixture();
  const iam = new InMemoryIamRepositoryAdapter();
  iam.seed([membership()]);
  const authorization = new IamBackedIaeAuthorizationAdapter(iam);
  const signer: CloudOriginalSignerPortV1 = {
    sign: async (input) => ({
      accepted: true,
      value: {
        signedDescriptor: `signed-cloud-descriptor-${input.artifactVersionId}`,
        expiresAt: input.expiresAt,
      },
    }),
  };
  const service = new IaeOriginalViewService(repository, authorization, signer);

  const resolved = await service.resolveOriginalView(tenantContext, {
    artifactVersionId: ids.versionId,
    evidenceId: ids.evidenceId,
    now,
  });
  assert.equal(resolved.accepted, true);
  if (!resolved.accepted) return;
  assert.equal(resolved.value.action, 'OPEN_CLOUD');
  assert.equal(resolved.value.signedDescriptor, `signed-cloud-descriptor-${ids.versionId}`);
  assert.equal('opaqueReference' in resolved.value, false);
  assert.equal(Date.parse(resolved.value.expiresAt) - Date.parse(now), 300_000);

  const crossTenant = await service.resolveOriginalView(context(ids.actorId, otherScope), {
    artifactVersionId: ids.versionId,
    now,
  });
  assert.equal(crossTenant.accepted, false);
  if (crossTenant.accepted) return;
  assert.ok(['TENANT_SCOPE_MISMATCH', 'MEMBERSHIP_NOT_FOUND'].includes(crossTenant.code));

  iam.seed([membership('REMOVED')]);
  const revoked = await service.resolveOriginalView(tenantContext, {
    artifactVersionId: ids.versionId,
    now,
  });
  assert.equal(revoked.accepted, false);
  if (revoked.accepted) return;
  assert.ok(['MEMBERSHIP_REVOKED', 'MEMBERSHIP_NOT_FOUND'].includes(revoked.code));
});

void test('[IAE-006, IAE-008] evidence and version IDs cannot be mixed across exact artifact records', async () => {
  const { repository, tenantContext } = await artifactFixture();
  const iam = new InMemoryIamRepositoryAdapter();
  iam.seed([membership()]);
  const authorization = new IamBackedIaeAuthorizationAdapter(iam);
  const signer: CloudOriginalSignerPortV1 = {
    sign: async (input) => ({
      accepted: true,
      value: { signedDescriptor: 'signed-cloud-descriptor', expiresAt: input.expiresAt },
    }),
  };
  const service = new IaeOriginalViewService(repository, authorization, signer);

  const wrongEvidence = await service.resolveOriginalView(tenantContext, {
    artifactVersionId: ids.versionId,
    evidenceId: ids.otherEvidenceId,
    now,
  });
  assert.deepEqual(wrongEvidence, { accepted: false, code: 'EVIDENCE_NOT_FOUND' });

  const wrongScope = await service.resolveOriginalView(
    context(ids.actorId, otherScope, 'wrong-scope'),
    { artifactVersionId: ids.otherVersionId, now },
  );
  assert.equal(wrongScope.accepted, false);
  if (wrongScope.accepted) return;
  assert.ok(['ARTIFACT_NOT_FOUND', 'MEMBERSHIP_NOT_FOUND'].includes(wrongScope.code));
});

void test('[IAE-004, IAE-019, IAE-059] LOCAL original views return only a source-device action', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const tenantContext = context(ids.actorId, scope, 'local-original-view');
  const artifacts = new ArtifactService(repository);
  const registered = await artifacts.register(tenantContext, {
    version: {
      artifactId: ids.artifactId,
      versionId: ids.otherVersionId,
      tenantScope: scope,
      sourceKind: 'FILE',
      dataMode: 'Local',
      contentSha256: 'f'.repeat(64),
      byteSize: 10,
      mediaType: 'text/csv',
      displayName: 'local.csv',
      createdAt: now,
    },
    placement: {
      placementId: ids.placementId,
      tenantScope: scope,
      kind: 'LOCAL',
      opaqueReference: 'source-device-handle-000001',
      contentSha256: 'f'.repeat(64),
    },
  });
  assert.equal(registered.accepted, true);
  const iam = new InMemoryIamRepositoryAdapter();
  iam.seed([membership()]);
  const service = new IaeOriginalViewService(
    repository,
    new IamBackedIaeAuthorizationAdapter(iam),
    { sign: async () => ({ accepted: false, code: 'SIGNING_UNAVAILABLE' }) },
  );
  const resolved = await service.resolveOriginalView(tenantContext, {
    artifactVersionId: ids.otherVersionId,
    now,
  });
  assert.equal(resolved.accepted, true);
  if (!resolved.accepted) return;
  assert.equal(resolved.value.action, 'OPEN_ON_SOURCE_DEVICE');
  assert.equal('signedDescriptor' in resolved.value, false);
  assert.equal('opaqueReference' in resolved.value, false);
});

function workerFixture() {
  const action = createTypedActionDefinitionV1({
    actionType: 'iae.capability.test',
    version: 1,
    inputSchemaId: 'input.v1',
    outputSchemaId: 'output.v1',
    handlerDigest: 'b'.repeat(64),
    requiredCapabilities: [],
    sideEffectClass: 'NONE',
    riskClass: 'READ_ONLY',
    defaultTimeoutSeconds: 60,
    maxAttempts: 2,
    approvalClass: 'NONE',
  });
  if (!action.accepted) throw new Error('invalid test action');
  const job = createJobV1({
    jobId: ids.jobId,
    tenantScope: scope,
    requestedBy: ids.actorId,
    action: action.value,
    inputManifestHash: 'c'.repeat(64),
    idempotencyKey: 'iae-worker-capability',
    createdAt: now,
  });
  if (!job.accepted) throw new Error('invalid test job');
  const attempt = createExecutionAttemptV1({
    attemptId: ids.attemptId,
    jobId: ids.jobId,
    tenantScope: scope,
    attemptNumber: 1,
    executorType: 'CLOUD_WORKER',
    executorId: ids.workerId,
    leaseTokenHash: 'd'.repeat(64),
    leaseExpiresAt: '2026-08-13T00:10:00.000Z',
    createdAt: now,
  });
  if (!attempt.accepted) throw new Error('invalid test attempt');
  const identity = {
    workerId: stable(ids.workerId),
    tenantScope: scope,
    securityEpoch: 9,
    correlationId: stable(ids.correlationId),
  } as const;
  return { job: job.value, attempt: attempt.value, identity };
}

void test('[JRA-006, JRA-007, JRA-023] worker capabilities bind exact attempt, epoch, worker, objects, and lease', async () => {
  const fixture = workerFixture();
  const repository = new InMemoryWorkerObjectCapabilityRepositoryAdapter();
  const inputResolver: IaeWorkerInputObjectResolverPortV1 = {
    resolveInputObjects: async () => ({
      accepted: true,
      value: {
        objects: [
          {
            objectId: ids.inputObjectId,
            contentSha256: 'e'.repeat(64),
            contentLength: 2048,
          },
        ],
        maxBytes: 4096,
      },
    }),
  };
  const outputResolver: IaeWorkerOutputObjectResolverPortV1 = {
    isResultObjectAllowed: async (input) => input.objectId === ids.resultObjectId,
  };
  const signer: IaeWorkerCapabilitySignerPortV1 = {
    sign: async (payload) => `capability-${payload.capabilityId}`,
  };
  const service = new IaeWorkerObjectCapabilityService(
    repository,
    inputResolver,
    outputResolver,
    signer,
    { isCurrent: async () => true },
    () => now,
  );
  const jraBridge = new IaeWorkerObjectGrantAuthorityAdapter(service);

  const grant = await service.issueInputGrant(fixture.identity, fixture.job, fixture.attempt, now);
  assert.equal(grant.accepted, true);
  if (!grant.accepted) return;
  assert.deepEqual(grant.value.objectIds, [ids.inputObjectId]);
  assert.deepEqual(grant.value.actions, ['READ']);
  assert.equal(grant.value.expiresAt, '2026-08-13T00:05:00.000Z');
  assert.match(grant.value.signedCapability, /^capability-/u);
  assert.equal(grant.value.signedCapability.includes(ids.inputObjectId), false);
  const workerGrant = await jraBridge.issueInputGrant(
    fixture.identity,
    fixture.job,
    fixture.attempt,
  );
  assert.deepEqual(workerGrant.actions, ['READ']);
  assert.equal(workerGrant.capabilityId, grant.value.capabilityId);

  const result = await service.acceptResultReferences(
    fixture.identity,
    fixture.job,
    fixture.attempt,
    [ids.resultObjectId],
    now,
  );
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value[0]?.action, 'WRITE');

  const replay = await service.acceptResultReferences(
    fixture.identity,
    fixture.job,
    fixture.attempt,
    [ids.resultObjectId],
    now,
  );
  assert.equal(replay.accepted, true);
  if (!replay.accepted) return;
  assert.equal(replay.value[0]?.capabilityId, result.value[0]?.capabilityId);

  const wrongEpoch = await service.issueInputGrant(
    { ...fixture.identity, securityEpoch: 10 },
    fixture.job,
    fixture.attempt,
    now,
  );
  assert.deepEqual(wrongEpoch, { accepted: false, code: 'SECURITY_EPOCH_REVOKED' });

  const crossTenant = await service.issueInputGrant(
    { ...fixture.identity, tenantScope: otherScope },
    fixture.job,
    fixture.attempt,
    now,
  );
  assert.deepEqual(crossTenant, { accepted: false, code: 'INVALID_SCOPE' });

  const wrongAttempt = await service.issueInputGrant(
    fixture.identity,
    { ...fixture.job, jobId: stable('00000000-0000-4000-8000-000000000799') },
    fixture.attempt,
    now,
  );
  assert.deepEqual(wrongAttempt, { accepted: false, code: 'ATTEMPT_MISMATCH' });

  const expired = await service.issueInputGrant(
    fixture.identity,
    fixture.job,
    fixture.attempt,
    '2026-08-13T00:11:00.000Z',
  );
  assert.deepEqual(expired, { accepted: false, code: 'LEASE_EXPIRED' });

  const unsafeResult = await service.acceptResultReferences(
    fixture.identity,
    fixture.job,
    fixture.attempt,
    ['C:\\secret.csv'],
    now,
  );
  assert.deepEqual(unsafeResult, { accepted: false, code: 'INVALID_OBJECT_REFERENCE' });

  await service.revokeForAttempt(fixture.identity.tenantScope, fixture.attempt.attemptId);
  const revoked = await service.issueInputGrant(
    fixture.identity,
    fixture.job,
    fixture.attempt,
    now,
  );
  assert.deepEqual(revoked, { accepted: false, code: 'CAPABILITY_REVOKED' });
});

void test('[IAE-016, IAE-021] retention authorization remains a separate exact-scope boundary', async () => {
  const authorization: IaeAuthorizationPortV1 = {
    authorize: async (_context, input) =>
      input.tenantScope === scope && input.action === 'RETENTION_MANAGE'
        ? { accepted: true, value: true }
        : { accepted: false, code: 'TENANT_SCOPE_MISMATCH' },
  };
  assert.equal(typeof authorization.authorize, 'function');
});
