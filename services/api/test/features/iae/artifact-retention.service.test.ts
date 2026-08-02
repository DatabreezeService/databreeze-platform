import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InMemoryArtifactRetentionRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-retention-repository.adapter.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { ArtifactRetentionService } from '../../../src/features/iae/application/artifact-retention.service.js';
import { ArtifactService } from '../../../src/features/iae/application/artifact.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000711';
const workspaceId = '00000000-0000-4000-8000-000000000712';
const artifactId = '00000000-0000-4000-8000-000000000713';
const versionId = '00000000-0000-4000-8000-000000000714';

function context(key: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000715',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000716',
    idempotencyKey: key,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function retention(legalHold: boolean) {
  return {
    evaluatedAt: '2026-01-03T00:00:00.000Z',
    workspaceRetentionUntil: '2025-12-01T00:00:00.000Z',
    resourceRetentionUntil: '2025-12-01T00:00:00.000Z',
    auditRetentionUntil: '2025-12-01T00:00:00.000Z',
    recoveryWindowUntil: '2025-12-01T00:00:00.000Z',
    activeApproval: false,
    legalHold,
  };
}

void test('[IAE-016, IAE-021] retention service preserves blocked requests and authorizes only after re-evaluation', async () => {
  const artifacts = new InMemoryArtifactRepositoryAdapter();
  const tenantContext = context('retention-artifact');
  const artifactService = new ArtifactService(artifacts);
  await artifactService.register(tenantContext, {
    version: {
      artifactId,
      versionId,
      tenantScope: tenantContext.tenantScope,
      sourceKind: 'FILE',
      dataMode: 'Local',
      contentSha256: 'd'.repeat(64),
      byteSize: 1,
      mediaType: 'text/plain',
      displayName: 'private.txt',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    placement: {
      placementId: '00000000-0000-4000-8000-000000000717',
      tenantScope: tenantContext.tenantScope,
      kind: 'LOCAL',
      opaqueReference: 'local-placement-000003',
      contentSha256: 'd'.repeat(64),
    },
  });
  const service = new ArtifactRetentionService(
    new InMemoryArtifactRetentionRepositoryAdapter(),
    artifacts,
  );
  const request = await service.request(tenantContext, {
    requestId: '00000000-0000-4000-8000-000000000718',
    artifactVersionId: versionId,
    tenantScope: tenantContext.tenantScope,
    requestedBy: tenantContext.actorId,
    requestedAt: '2026-01-03T00:00:00.000Z',
    retention: retention(true),
  });
  assert.equal(request.accepted, true);
  if (!request.accepted) return;
  assert.equal(request.value.state, 'BLOCKED');
  const stale = await service.authorize(tenantContext, {
    requestId: request.value.requestId,
    retention: retention(true),
    approvedAt: '2026-01-04T00:00:00.000Z',
    mfaSatisfied: true,
    expectedRevision: request.value.revision,
  });
  assert.deepEqual(stale, { accepted: false, code: 'RETENTION_BLOCKED' });
  const authorized = await service.authorize(tenantContext, {
    requestId: request.value.requestId,
    retention: retention(false),
    approvedAt: '2026-01-04T00:00:00.000Z',
    mfaSatisfied: true,
    expectedRevision: request.value.revision,
  });
  assert.equal(authorized.accepted, true);
  if (authorized.accepted) {
    assert.equal(authorized.value.state, 'AUTHORIZED');
    const found = await service.find(tenantContext, authorized.value.requestId);
    assert.deepEqual(found, authorized);
  }
});
