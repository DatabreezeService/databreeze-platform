import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { InMemoryArtifactRetentionRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-retention-repository.adapter.js';
import { InMemoryEvidenceGrantRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-evidence-grant-repository.adapter.js';
import { ArtifactService } from '../../../src/features/iae/application/artifact.service.js';
import { AuthorizedArtifactAccessService } from '../../../src/features/iae/application/authorized-artifact-access.service.js';
import { IamBackedIaeAuthorizationAdapter } from '../../../src/features/iae/application/iae-authorization.port.js';

const organizationId = '00000000-0000-4000-8000-000000000741';
const workspaceId = '00000000-0000-4000-8000-000000000742';
const actorId = '00000000-0000-4000-8000-000000000743';
const artifactId = '00000000-0000-4000-8000-000000000744';
const versionId = '00000000-0000-4000-8000-000000000745';
const placementId = '00000000-0000-4000-8000-000000000746';
const requestId = '00000000-0000-4000-8000-000000000747';
const evidenceId = '00000000-0000-4000-8000-000000000753';
const recipientDeviceId = '00000000-0000-4000-8000-000000000754';

function context(key: string, actor = actorId) {
  const result = createIamTenantContextV1({
    actorId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 4,
    correlationId: '00000000-0000-4000-8000-000000000748',
    idempotencyKey: key,
    mfaReenrollmentRequired: false,
  });
  if (!result.accepted) throw new Error('invalid test context');
  return { ...result.value, actorId: actor as typeof result.value.actorId };
}

function retention(legalHold: boolean) {
  return {
    evaluatedAt: '2026-08-13T00:00:00.000Z',
    workspaceRetentionUntil: '2026-08-12T00:00:00.000Z',
    resourceRetentionUntil: '2026-08-12T00:00:00.000Z',
    auditRetentionUntil: '2026-08-12T00:00:00.000Z',
    recoveryWindowUntil: '2026-08-12T00:00:00.000Z',
    activeApproval: false,
    legalHold,
  };
}

void test('[IAE-008, IAE-016, IAE-021] public retention facade checks actor membership before legal-hold state', async () => {
  const artifacts = new InMemoryArtifactRepositoryAdapter();
  const tenantContext = context('authorized-retention');
  await new ArtifactService(artifacts).register(tenantContext, {
    version: {
      artifactId,
      versionId,
      tenantScope: tenantContext.tenantScope,
      sourceKind: 'FILE',
      dataMode: 'Local',
      contentSha256: 'e'.repeat(64),
      byteSize: 1,
      mediaType: 'text/plain',
      displayName: 'private.txt',
      createdAt: '2026-08-13T00:00:00.000Z',
    },
    placement: {
      placementId,
      tenantScope: tenantContext.tenantScope,
      kind: 'LOCAL',
      opaqueReference: 'source-device-handle-000001',
      contentSha256: 'e'.repeat(64),
    },
    evidence: {
      evidenceId,
      tenantScope: tenantContext.tenantScope,
      coordinate: { kind: 'ROW', row: 1, field: 'amount' },
    },
  });
  const iam = new InMemoryIamRepositoryAdapter();
  iam.seed([
    {
      id: '00000000-0000-4000-8000-000000000749' as never,
      principalId: actorId as never,
      scope: tenantContext.tenantScope,
      roleId: 'admin',
      status: 'ACTIVE',
      revision: 1,
    },
  ]);
  const service = new AuthorizedArtifactAccessService(
    artifacts,
    new InMemoryEvidenceGrantRepositoryAdapter(),
    new InMemoryArtifactRetentionRepositoryAdapter(),
    new IamBackedIaeAuthorizationAdapter(iam),
  );
  const blocked = await service.requestRetention(tenantContext, {
    requestId,
    artifactVersionId: versionId,
    tenantScope: {
      scopeType: 'workspace',
      organizationId,
      workspaceId: '00000000-0000-4000-8000-000000000757',
    },
    requestedBy: '00000000-0000-4000-8000-000000000758',
    requestedAt: '2026-08-13T00:00:00.000Z',
    retention: retention(true),
  });
  assert.equal(blocked.accepted, true);
  if (!blocked.accepted) return;
  assert.equal(blocked.value.state, 'BLOCKED');
  await artifacts.updateVersionStatus(tenantContext, versionId as never, 'DELETED');
  assert.deepEqual(
    await service.requireArtifactVersion(tenantContext, { artifactVersionId: versionId }),
    {
      accepted: false,
      code: 'ARTIFACT_UNAVAILABLE',
    },
  );

  iam.seed([
    {
      id: '00000000-0000-4000-8000-000000000749' as never,
      principalId: actorId as never,
      scope: tenantContext.tenantScope,
      roleId: 'admin',
      status: 'REMOVED',
      revision: 2,
    },
  ]);
  const revoked = await service.authorizeRetention(tenantContext, {
    requestId,
    retention: retention(false),
    approvedAt: '2026-08-13T00:01:00.000Z',
    mfaSatisfied: true,
    expectedRevision: blocked.value.revision,
  });
  assert.equal(revoked.accepted, false);
  if (revoked.accepted) return;
  assert.ok(['MEMBERSHIP_REVOKED', 'MEMBERSHIP_NOT_FOUND'].includes(revoked.code));
});

void test('[IAE-005, IAE-006, IAE-008] public evidence facade binds exact version and rechecks revocation', async () => {
  const artifacts = new InMemoryArtifactRepositoryAdapter();
  const tenantContext = context('authorized-evidence');
  await new ArtifactService(artifacts).register(tenantContext, {
    version: {
      artifactId,
      versionId,
      tenantScope: tenantContext.tenantScope,
      sourceKind: 'FILE',
      dataMode: 'Local',
      contentSha256: 'e'.repeat(64),
      byteSize: 1,
      mediaType: 'text/plain',
      displayName: 'private.txt',
      createdAt: '2026-08-13T00:00:00.000Z',
    },
    placement: {
      placementId,
      tenantScope: tenantContext.tenantScope,
      kind: 'LOCAL',
      opaqueReference: 'source-device-handle-000001',
      contentSha256: 'e'.repeat(64),
    },
    evidence: {
      evidenceId,
      tenantScope: tenantContext.tenantScope,
      coordinate: { kind: 'ROW', row: 1, field: 'amount' },
    },
  });
  const iam = new InMemoryIamRepositoryAdapter();
  iam.seed([
    {
      id: '00000000-0000-4000-8000-000000000749' as never,
      principalId: actorId as never,
      scope: tenantContext.tenantScope,
      roleId: 'analyst',
      status: 'ACTIVE',
      revision: 1,
    },
  ]);
  const service = new AuthorizedArtifactAccessService(
    artifacts,
    new InMemoryEvidenceGrantRepositoryAdapter(),
    new InMemoryArtifactRetentionRepositoryAdapter(),
    new IamBackedIaeAuthorizationAdapter(iam),
  );
  const evidence = await service.issueEvidenceGrant(tenantContext, {
    versionId,
    evidenceId,
    grantId: '00000000-0000-4000-8000-000000000755',
    recipientDeviceId,
    action: 'OPEN_ON_DEVICE',
    issuedAt: '2026-08-13T00:00:00.000Z',
    expiresAt: '2026-08-13T00:05:00.000Z',
    authorizationEpoch: tenantContext.authorizationEpoch,
  });
  assert.equal(evidence.accepted, true);
  const missingEvidence = await service.requireEvidenceReference(tenantContext, {
    artifactVersionId: versionId,
    evidenceId: '00000000-0000-4000-8000-000000000756',
  });
  assert.deepEqual(missingEvidence, { accepted: false, code: 'EVIDENCE_NOT_FOUND' });
  if (!evidence.accepted) return;

  iam.seed([
    {
      id: '00000000-0000-4000-8000-000000000749' as never,
      principalId: actorId as never,
      scope: tenantContext.tenantScope,
      roleId: 'analyst',
      status: 'REMOVED',
      revision: 2,
    },
  ]);
  const revoked = await service.revokeEvidenceGrant(tenantContext, evidence.value.grantId);
  assert.equal(revoked.accepted, false);
  if (revoked.accepted) return;
  assert.ok(['MEMBERSHIP_REVOKED', 'MEMBERSHIP_NOT_FOUND'].includes(revoked.code));
});
