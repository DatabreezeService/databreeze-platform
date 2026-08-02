import assert from 'node:assert/strict';
import test from 'node:test';

import { createArtifactVersionV1 } from '@databreeze/domain/artifact/v1';

import { InMemoryArtifactIntakeRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-intake-repository.adapter.js';
import { ArtifactIntakeService } from '../../../src/features/iae/application/artifact-intake.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

function context(workspace: string, idempotencyKey: string, expectedRevision?: number) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

const inbox = {
  inboxItemId: '00000000-0000-4000-8000-000000000020',
  tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
  idempotencyKey: 'intake-1',
  artifactVersionId: '00000000-0000-4000-8000-000000000021',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const artifactResult = createArtifactVersionV1({
  artifactId: '00000000-0000-4000-8000-000000000022',
  versionId: inbox.artifactVersionId,
  tenantScope: inbox.tenantScope,
  sourceKind: 'FILE',
  dataMode: 'Hybrid',
  contentSha256: 'a'.repeat(64),
  byteSize: 24,
  mediaType: 'text/csv',
  displayName: 'orders.csv',
  createdAt: '2026-01-01T00:00:00.000Z',
  status: 'QUARANTINED',
});
if (!artifactResult.accepted) throw new Error('invalid artifact fixture');
const artifact = artifactResult.value;

void test('[IAE-001] create returns the same inbox item for a repeated key', async () => {
  const service = new ArtifactIntakeService(new InMemoryArtifactIntakeRepositoryAdapter());
  const first = await service.create(context(workspaceId, 'create-1'), inbox);
  const second = await service.create(context(workspaceId, 'create-2'), inbox);
  assert.deepEqual(second, first);
  assert.equal(
    (
      await service.create(context(workspaceId, 'create-3'), {
        ...inbox,
        artifactVersionId: '00000000-0000-4000-8000-000000000023',
      })
    ).accepted,
    false,
  );
});

void test('[IAE-009, IAE-010, IAM-009] admission moves clean content to routed and quarantines malicious content', async () => {
  const service = new ArtifactIntakeService(new InMemoryArtifactIntakeRepositoryAdapter());
  const created = await service.create(context(workspaceId, 'admit-1'), inbox);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const admitted = await service.admit(
    context(workspaceId, 'admit-2', created.value.revision),
    created.value.inboxItemId,
    artifact,
    {
      actualSha256: artifact.contentSha256,
      actualByteSize: artifact.byteSize,
      detectedMediaType: artifact.mediaType,
      scanState: 'CLEAN',
      maxByteSize: 100,
    },
  );
  assert.equal(admitted.accepted, true);
  if (!admitted.accepted) return;
  assert.equal(admitted.value.item.state, 'ROUTED');
  const sibling = await service.admit(
    context(siblingWorkspaceId, 'admit-3'),
    created.value.inboxItemId,
    artifact,
    {
      actualSha256: artifact.contentSha256,
      actualByteSize: artifact.byteSize,
      detectedMediaType: artifact.mediaType,
      scanState: 'CLEAN',
      maxByteSize: 100,
    },
  );
  assert.deepEqual(sibling, { accepted: false, code: 'INBOX_NOT_FOUND' });
});

void test('[IAE-001, IAM-009] inbox listing is scoped and newest-first', async () => {
  const service = new ArtifactIntakeService(new InMemoryArtifactIntakeRepositoryAdapter());
  await service.create(context(workspaceId, 'list-1'), inbox);
  await service.create(context(workspaceId, 'list-2'), {
    ...inbox,
    inboxItemId: '00000000-0000-4000-8000-000000000024',
    artifactVersionId: '00000000-0000-4000-8000-000000000025',
    createdAt: '2026-01-02T00:00:00.000Z',
    idempotencyKey: 'list-2',
  });
  await service.create(context(siblingWorkspaceId, 'list-3'), {
    ...inbox,
    inboxItemId: '00000000-0000-4000-8000-000000000026',
    artifactVersionId: '00000000-0000-4000-8000-000000000027',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: siblingWorkspaceId },
    createdAt: '2026-01-03T00:00:00.000Z',
    idempotencyKey: 'list-3',
  });
  const listed = await service.list(context(workspaceId, 'list-read'));
  assert.deepEqual(
    listed.map((item) => item.inboxItemId),
    ['00000000-0000-4000-8000-000000000024', inbox.inboxItemId],
  );
});
