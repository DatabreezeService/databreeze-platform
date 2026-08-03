import assert from 'node:assert/strict';
import test from 'node:test';

import { createArtifactVersionV1, createContentPlacementV1 } from '@databreeze/domain/artifact/v1';

import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const otherWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

function context(workspace: string, expectedRevision?: number) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    actorId,
    correlationId,
    idempotencyKey: `artifact-${workspace}`,
    authorizationEpoch: 1,
    expectedRevision,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid tenant context');
  return result.value;
}

function version(workspace: string) {
  const result = createArtifactVersionV1({
    artifactId: '00000000-0000-4000-8000-000000000020',
    versionId:
      workspace === workspaceId
        ? '00000000-0000-4000-8000-000000000021'
        : '00000000-0000-4000-8000-000000000022',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'b'.repeat(64),
    byteSize: 10,
    mediaType: 'text/csv',
    displayName: 'sales.csv',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid artifact version');
  return result.value;
}

void test('[IAE-001, IAM-009, IAM-019] artifact repository isolates sibling workspaces', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const stored = version(workspaceId);
  await repository.saveVersion(context(workspaceId), stored);
  assert.equal(
    (await repository.findVersion(context(workspaceId), stored.versionId))?.versionId,
    stored.versionId,
  );
  assert.equal(
    await repository.findVersion(context(otherWorkspaceId), stored.versionId),
    undefined,
  );
});

void test('[IAE-003, IAE-004] versions are immutable and placements require matching content', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const stored = version(workspaceId);
  await repository.saveVersion(context(workspaceId), stored);
  await assert.rejects(
    repository.saveVersion(context(workspaceId), { ...stored, displayName: 'changed.csv' }),
    /IAE_IMMUTABLE_VERSION/,
  );
  const placement = createContentPlacementV1({
    placementId: '00000000-0000-4000-8000-000000000023',
    artifactVersion: stored,
    tenantScope: stored.tenantScope,
    kind: 'CLOUD',
    opaqueReference: 'cloud-reference_1234',
    contentSha256: stored.contentSha256,
  });
  assert.equal(placement.accepted, true);
  if (!placement.accepted) return;
  await repository.savePlacement(context(workspaceId), placement.value);
  assert.equal((await repository.listPlacements(context(workspaceId), stored.versionId)).length, 1);
});

void test('[IAE-003, IAM-009] placement updates authorize the persisted workspace scope', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const stored = version(otherWorkspaceId);
  await repository.saveVersion(context(otherWorkspaceId), stored);
  const placement = createContentPlacementV1({
    placementId: '00000000-0000-4000-8000-000000000024',
    artifactVersion: stored,
    tenantScope: stored.tenantScope,
    kind: 'CLOUD',
    opaqueReference: 'cloud-reference_5678',
    contentSha256: stored.contentSha256,
  });
  assert.equal(placement.accepted, true);
  if (!placement.accepted) return;
  await repository.savePlacement(context(otherWorkspaceId), placement.value);

  await assert.rejects(
    repository.updatePlacement(context(workspaceId), {
      ...placement.value,
      tenantScope: context(workspaceId).tenantScope,
      available: false,
      revision: 2,
    }),
    /IAE_SCOPE_NARROWING_REQUIRED/u,
  );
});

void test('[IAE-001, IAM-009] transaction rollback does not leak a staged artifact', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const stored = version(workspaceId);
  await assert.rejects(
    repository.withTransaction(context(workspaceId), async (transaction) => {
      await transaction.saveVersion(context(workspaceId), stored);
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.equal(await repository.findVersion(context(workspaceId), stored.versionId), undefined);
});
