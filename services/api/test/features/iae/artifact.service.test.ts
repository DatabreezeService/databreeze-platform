import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { ArtifactService } from '../../../src/features/iae/application/artifact.service.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid artifact identifier');
  return parsed.value;
}

function context(workspace: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid artifact context');
  return result.value;
}

function input(dataMode: 'Local' | 'Hybrid') {
  return {
    version: {
      artifactId: '00000000-0000-4000-8000-000000000020',
      versionId: '00000000-0000-4000-8000-000000000021',
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      sourceKind: 'FILE',
      dataMode,
      contentSha256: 'b'.repeat(64),
      byteSize: 10,
      mediaType: 'text/csv',
      displayName: 'sales.csv',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    placement: {
      placementId: '00000000-0000-4000-8000-000000000022',
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      kind: dataMode === 'Local' ? 'LOCAL' : 'CLOUD',
      opaqueReference: 'opaque-reference_1234',
      contentSha256: 'b'.repeat(64),
    },
    evidence: {
      evidenceId: '00000000-0000-4000-8000-000000000023',
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      coordinate: { kind: 'ROW', row: 2, field: 'amount' },
      excerpt: dataMode === 'Local' ? undefined : '42',
    },
  };
}

void test('[IAE-001, IAE-003, IAE-004, IAE-005] registration persists immutable version, opaque placement, and evidence', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const service = new ArtifactService(repository);
  const registered = await service.register(context(workspaceId, 'register-1'), input('Hybrid'));
  assert.equal(registered.accepted, true);
  if (!registered.accepted) return;
  assert.deepEqual(
    await service.register(context(workspaceId, 'register-1'), input('Hybrid')),
    registered,
  );
  const found = await service.find(
    context(workspaceId, 'read-1'),
    registered.value.version.versionId,
  );
  assert.equal(found.version?.contentSha256, 'b'.repeat(64));
  assert.equal(found.placements[0]?.opaqueReference, 'opaque-reference_1234');
  assert.equal(found.evidence[0]?.coordinate.kind, 'ROW');
  assert.equal(
    (await service.find(context(siblingWorkspaceId, 'read-2'), registered.value.version.versionId))
      .version,
    undefined,
  );
});

void test('[IAE-006] Local registration cannot create cloud placement or source excerpt', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const service = new ArtifactService(repository);
  const local = input('Local');
  const invalidPlacement = await service.register(context(workspaceId, 'local-1'), {
    ...local,
    placement: { ...local.placement, kind: 'CLOUD' },
  });
  assert.deepEqual(invalidPlacement, { accepted: false, code: 'LOCAL_CONTENT_LEAK' });
  const invalidEvidence = await service.register(context(workspaceId, 'local-2'), {
    ...local,
    evidence: { ...local.evidence, excerpt: 'must-not-leave-device' },
  });
  assert.deepEqual(invalidEvidence, { accepted: false, code: 'LOCAL_CONTENT_LEAK' });
  assert.equal(
    (await service.find(context(workspaceId, 'read-3'), stable(local.version.versionId))).version,
    undefined,
  );
});

void test('[IAE-005, IAE-006] evidence resolution returns an opaque device action for Local content', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const service = new ArtifactService(repository);
  const registered = await service.register(context(workspaceId, 'resolve-local'), input('Local'));
  assert.equal(registered.accepted, true);
  if (!registered.accepted || !registered.value.evidence) return;
  const resolved = await service.resolveEvidence(
    context(workspaceId, 'resolve-local-read'),
    registered.value.version.versionId,
    registered.value.evidence.evidenceId,
  );
  assert.equal(resolved?.action, 'OPEN_ON_SOURCE_DEVICE');
  assert.equal(resolved?.placementReference, 'opaque-reference_1234');
  assert.equal(resolved?.evidence.excerpt, undefined);
  assert.doesNotMatch(resolved?.placementReference ?? '', /[\\/]/u);
  assert.equal(
    await service.resolveEvidence(
      context(siblingWorkspaceId, 'resolve-local-sibling'),
      registered.value.version.versionId,
      registered.value.evidence.evidenceId,
    ),
    undefined,
  );
});
