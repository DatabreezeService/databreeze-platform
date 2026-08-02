import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InMemoryArtifactIntakeRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-intake-repository.adapter.js';
import { ArtifactIntakeService } from '../../../src/features/iae/application/artifact-intake.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

const organizationId = '00000000-0000-4000-8000-000000000631';
const workspaceId = '00000000-0000-4000-8000-000000000632';
const inboxItemId = '00000000-0000-4000-8000-000000000633';
const artifactVersionId = '00000000-0000-4000-8000-000000000634';

function context(idempotencyKey: string, expectedRevision?: number) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000635',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000636',
    idempotencyKey,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function stable(value: string) {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture identifier rejected');
  return result.value;
}

void test('[IAE-013] service updates assignment, labels, priority, and due date with optimistic revisions', async () => {
  const service = new ArtifactIntakeService(new InMemoryArtifactIntakeRepositoryAdapter());
  const created = await service.create(context('metadata-create'), {
    inboxItemId,
    tenantScope: context('metadata-scope').tenantScope,
    idempotencyKey: 'metadata-item',
    artifactVersionId,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  const updated = await service.updateMetadata(context('metadata-update', 1), stable(inboxItemId), {
    assigneeId: '00000000-0000-4000-8000-000000000637',
    labels: ['finance'],
    priority: 'HIGH',
    dueAt: '2026-01-02T00:00:00.000Z',
  });
  assert.equal(updated.accepted, true);
  if (updated.accepted) {
    assert.equal(updated.value.priority, 'HIGH');
    assert.deepEqual(updated.value.labels, ['finance']);
    assert.equal(updated.value.revision, 2);
  }
  const stale = await service.updateMetadata(context('metadata-stale', 1), stable(inboxItemId), {
    labels: ['stale'],
  });
  assert.deepEqual(stale, { accepted: false, code: 'REVISION_CONFLICT' });
});
