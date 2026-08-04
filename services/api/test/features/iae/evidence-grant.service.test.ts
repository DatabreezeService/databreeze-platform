import assert from 'node:assert/strict';
import test from 'node:test';

import { EvidenceGrantService } from '../../../src/features/iae/application/evidence-grant.service.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { InMemoryEvidenceGrantRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-evidence-grant-repository.adapter.js';
import { ArtifactService } from '../../../src/features/iae/application/artifact.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';
const deviceId = '00000000-0000-4000-8000-000000000012';

function context(idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 2,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

const input = {
  grantId: '00000000-0000-4000-8000-000000000020',
  evidenceId: '00000000-0000-4000-8000-000000000021',
  artifactVersionId: '00000000-0000-4000-8000-000000000022',
  recipientDeviceId: deviceId,
  action: 'EXCERPT',
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-01T00:05:00.000Z',
  authorizationEpoch: 2,
  artifactDataMode: 'Hybrid',
  sourceState: 'AVAILABLE',
} as const;

void test('[IAE-005] service issues and resolves an epoch-bound grant', async () => {
  const service = new EvidenceGrantService(new InMemoryEvidenceGrantRepositoryAdapter());
  const issued = await service.issue(context('grant-issue'), input);
  assert.equal(issued.accepted, true);
  const resolved = await service.resolve(context('grant-resolve'), {
    grantId: input.grantId,
    recipientDeviceId: deviceId,
    authorizationEpoch: 2,
    now: '2026-01-01T00:01:00.000Z',
  });
  assert.equal(resolved.accepted, true);
});

void test('[IAE-005, IAM-020] revoked, expired, and mismatched grants fail closed', async () => {
  const service = new EvidenceGrantService(new InMemoryEvidenceGrantRepositoryAdapter());
  await service.issue(context('grant-fail'), input);
  assert.deepEqual(
    await service.resolve(context('grant-device'), {
      grantId: input.grantId,
      recipientDeviceId: '00000000-0000-4000-8000-000000000099',
      authorizationEpoch: 2,
      now: '2026-01-01T00:01:00.000Z',
    }),
    { accepted: false, code: 'DEVICE_MISMATCH' },
  );
  assert.deepEqual(
    await service.resolve(context('grant-epoch'), {
      grantId: input.grantId,
      recipientDeviceId: deviceId,
      authorizationEpoch: 3,
      now: '2026-01-01T00:01:00.000Z',
    }),
    { accepted: false, code: 'EPOCH_MISMATCH' },
  );
  assert.deepEqual(
    await service.resolve(context('grant-expired'), {
      grantId: input.grantId,
      recipientDeviceId: deviceId,
      authorizationEpoch: 2,
      now: '2026-01-01T00:06:00.000Z',
    }),
    { accepted: false, code: 'GRANT_EXPIRED' },
  );
  await service.revoke(context('grant-revoke'), input.grantId);
  assert.deepEqual(
    await service.resolve(context('grant-revoked'), {
      grantId: input.grantId,
      recipientDeviceId: deviceId,
      authorizationEpoch: 2,
      now: '2026-01-01T00:01:00.000Z',
    }),
    { accepted: false, code: 'GRANT_REVOKED' },
  );
});

void test('[IAM-020] issuing a grant with a stale authorization epoch is rejected', async () => {
  const service = new EvidenceGrantService(new InMemoryEvidenceGrantRepositoryAdapter());
  assert.deepEqual(
    await service.issue(context('grant-stale-epoch'), { ...input, authorizationEpoch: 1 }),
    { accepted: false, code: 'EPOCH_MISMATCH' },
  );
});

void test('[IAE-005, IAE-010] evidence grants reject active artifacts with failed or malicious scans', async () => {
  for (const scanState of ['MALICIOUS', 'FAILED'] as const) {
    const artifacts = new InMemoryArtifactRepositoryAdapter();
    const artifactService = new ArtifactService(artifacts);
    const versionId =
      scanState === 'MALICIOUS'
        ? '00000000-0000-4000-8000-000000000030'
        : '00000000-0000-4000-8000-000000000031';
    const evidenceId =
      scanState === 'MALICIOUS'
        ? '00000000-0000-4000-8000-000000000032'
        : '00000000-0000-4000-8000-000000000033';
    const registered = await artifactService.register(
      context(`grant-${scanState.toLowerCase()}-source`),
      {
        version: {
          artifactId: '00000000-0000-4000-8000-000000000034',
          versionId,
          tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
          sourceKind: 'FILE',
          dataMode: 'Hybrid',
          contentSha256: 'c'.repeat(64),
          byteSize: 10,
          mediaType: 'text/csv',
          displayName: `${scanState.toLowerCase()}.csv`,
          createdAt: '2026-01-01T00:00:00.000Z',
          status: 'ACTIVE',
          scanState,
        },
        placement: {
          placementId: '00000000-0000-4000-8000-000000000035',
          tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
          kind: 'CLOUD',
          opaqueReference: `cloud-${scanState.toLowerCase()}-0001`,
          contentSha256: 'c'.repeat(64),
        },
        evidence: {
          evidenceId,
          tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
          coordinate: { kind: 'ROW', row: 1 },
          sourceState: 'AVAILABLE',
        },
      },
    );
    assert.equal(registered.accepted, true);

    const service = new EvidenceGrantService(
      new InMemoryEvidenceGrantRepositoryAdapter(),
      artifacts,
    );
    assert.deepEqual(
      await service.issueForEvidence(context(`grant-${scanState.toLowerCase()}-issue`), {
        versionId,
        evidenceId,
        grantId:
          scanState === 'MALICIOUS'
            ? '00000000-0000-4000-8000-000000000036'
            : '00000000-0000-4000-8000-000000000037',
        recipientDeviceId: deviceId,
        action: 'EXCERPT',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:05:00.000Z',
        authorizationEpoch: 2,
        maxExcerptBytes: 128,
      }),
      { accepted: false, code: 'SOURCE_UNAVAILABLE' },
    );
  }
});
