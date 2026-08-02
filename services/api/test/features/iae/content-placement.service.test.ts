import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { ArtifactService } from '../../../src/features/iae/application/artifact.service.js';
import { ContentPlacementService } from '../../../src/features/iae/application/content-placement.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000651';
const workspaceId = '00000000-0000-4000-8000-000000000652';
const artifactId = '00000000-0000-4000-8000-000000000653';
const versionId = '00000000-0000-4000-8000-000000000654';
const placementId = '00000000-0000-4000-8000-000000000655';

function context(key: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000656',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000657',
    idempotencyKey: key,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

void test('[IAE-020, DSO-006] placement availability uses optimistic revisions and keeps identity immutable', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const tenantContext = context('placement-create');
  const artifacts = new ArtifactService(repository);
  const created = await artifacts.register(tenantContext, {
    version: {
      artifactId,
      versionId,
      tenantScope: tenantContext.tenantScope,
      sourceKind: 'FILE',
      dataMode: 'Hybrid',
      contentSha256: 'c'.repeat(64),
      byteSize: 1,
      mediaType: 'text/plain',
      displayName: 'note.txt',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    placement: {
      placementId,
      tenantScope: tenantContext.tenantScope,
      kind: 'CLOUD',
      opaqueReference: 'cloud-placement-000002',
      contentSha256: 'c'.repeat(64),
    },
  });
  assert.equal(created.accepted, true);
  const service = new ContentPlacementService(repository);
  const unavailable = await service.setAvailability(context('placement-offline'), {
    versionId,
    placementId,
    available: false,
    expectedRevision: 1,
  });
  assert.equal(unavailable.accepted, true);
  if (!unavailable.accepted) return;
  assert.equal(unavailable.value.available, false);
  assert.equal(unavailable.value.revision, 2);
  assert.equal(unavailable.value.opaqueReference, 'cloud-placement-000002');

  const stale = await service.setAvailability(context('placement-stale'), {
    versionId,
    placementId,
    available: true,
    expectedRevision: 1,
  });
  assert.deepEqual(stale, { accepted: false, code: 'REVISION_CONFLICT' });
});
