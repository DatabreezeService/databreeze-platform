import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryArtifactLineageRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-lineage-repository.adapter.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { DerivedArtifactService } from '../../../src/features/iae/application/derived-artifact.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';
const scope = { scopeType: 'workspace' as const, organizationId, workspaceId };

function context(idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: scope,
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function sourceInput(dataMode: 'Local' | 'Hybrid' | 'Cloud' = 'Hybrid') {
  return {
    version: {
      artifactId: '00000000-0000-4000-8000-000000000020',
      versionId: '00000000-0000-4000-8000-000000000021',
      tenantScope: scope,
      sourceKind: 'FILE',
      dataMode,
      contentSha256: 'a'.repeat(64),
      byteSize: 1,
      mediaType: 'text/csv',
      displayName: 'source.csv',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    placement: {
      placementId: '00000000-0000-4000-8000-000000000022',
      tenantScope: scope,
      kind: dataMode === 'Cloud' ? 'CLOUD' : 'LOCAL',
      opaqueReference: 'source-reference_1234',
      contentSha256: 'a'.repeat(64),
    },
  } as const;
}

void test('[IAE-007, IAE-008] derivative registration resolves sources and persists lineage atomically', async () => {
  const artifacts = new InMemoryArtifactRepositoryAdapter();
  const lineage = new InMemoryArtifactLineageRepositoryAdapter();
  const service = new DerivedArtifactService(artifacts, lineage);
  const source = sourceInput();
  const sourceService = new (
    await import('../../../src/features/iae/application/artifact.service.js')
  ).ArtifactService(artifacts);
  const registered = await sourceService.register(context('source'), source);
  assert.equal(registered.accepted, true);
  if (!registered.accepted) return;
  const derived = await service.register(context('derived'), {
    version: {
      artifactId: '00000000-0000-4000-8000-000000000030',
      versionId: '00000000-0000-4000-8000-000000000031',
      tenantScope: scope,
      sourceKind: 'GENERATED',
      dataMode: 'Hybrid',
      contentSha256: 'b'.repeat(64),
      byteSize: 2,
      mediaType: 'text/csv',
      displayName: 'derived.csv',
      createdAt: '2026-01-01T00:00:01.000Z',
    },
    placement: {
      placementId: '00000000-0000-4000-8000-000000000032',
      tenantScope: scope,
      kind: 'LOCAL',
      opaqueReference: 'derived-reference_1234',
      contentSha256: 'b'.repeat(64),
    },
    sourceArtifactVersionIds: [source.version.versionId],
    lineage: {
      lineageId: '00000000-0000-4000-8000-000000000033',
      processorVersion: 'spreadsheet-auditor@1',
      coordinateLineage: [],
    },
  });
  assert.equal(derived.accepted, true);
  if (!derived.accepted) return;
  assert.equal(
    (await lineage.findByDerived(context('read'), derived.value.version.versionId))?.lineageId,
    '00000000-0000-4000-8000-000000000033',
  );
});

void test('[IAE-008] Local source cannot produce a Hybrid derivative', async () => {
  const artifacts = new InMemoryArtifactRepositoryAdapter();
  const service = new DerivedArtifactService(
    artifacts,
    new InMemoryArtifactLineageRepositoryAdapter(),
  );
  const sourceService = new (
    await import('../../../src/features/iae/application/artifact.service.js')
  ).ArtifactService(artifacts);
  const source = sourceInput('Local');
  const registered = await sourceService.register(context('local-source'), source);
  assert.equal(registered.accepted, true);
  if (!registered.accepted) return;
  const rejected = await service.register(context('local-derived'), {
    version: {
      artifactId: '00000000-0000-4000-8000-000000000040',
      versionId: '00000000-0000-4000-8000-000000000041',
      tenantScope: scope,
      sourceKind: 'GENERATED',
      dataMode: 'Hybrid',
      contentSha256: 'c'.repeat(64),
      byteSize: 1,
      mediaType: 'text/csv',
      displayName: 'leak.csv',
      createdAt: '2026-01-01T00:00:01.000Z',
    },
    placement: {
      placementId: '00000000-0000-4000-8000-000000000042',
      tenantScope: scope,
      kind: 'CLOUD',
      opaqueReference: 'leak-reference_1234',
      contentSha256: 'c'.repeat(64),
    },
    sourceArtifactVersionIds: [source.version.versionId],
    lineage: {
      lineageId: '00000000-0000-4000-8000-000000000043',
      processorVersion: 'test@1',
      coordinateLineage: [],
    },
  });
  assert.deepEqual(rejected, { accepted: false, code: 'DATA_MODE_WIDENING' });
});

void test('[IAE-007] missing source prevents any derivative write', async () => {
  const artifacts = new InMemoryArtifactRepositoryAdapter();
  const service = new DerivedArtifactService(
    artifacts,
    new InMemoryArtifactLineageRepositoryAdapter(),
  );
  const rejected = await service.register(context('missing-source'), {
    version: {
      artifactId: '00000000-0000-4000-8000-000000000050',
      versionId: '00000000-0000-4000-8000-000000000051',
      tenantScope: scope,
      sourceKind: 'GENERATED',
      dataMode: 'Local',
      contentSha256: 'd'.repeat(64),
      byteSize: 1,
      mediaType: 'text/csv',
      displayName: 'missing.csv',
      createdAt: '2026-01-01T00:00:01.000Z',
    },
    placement: {
      placementId: '00000000-0000-4000-8000-000000000052',
      tenantScope: scope,
      kind: 'LOCAL',
      opaqueReference: 'missing-reference_1234',
      contentSha256: 'd'.repeat(64),
    },
    sourceArtifactVersionIds: ['00000000-0000-4000-8000-000000000053'],
    lineage: {
      lineageId: '00000000-0000-4000-8000-000000000054',
      processorVersion: 'test@1',
      coordinateLineage: [],
    },
  });
  assert.deepEqual(rejected, { accepted: false, code: 'SOURCE_NOT_FOUND' });
  assert.equal(
    await artifacts.findVersion(
      context('missing-read'),
      '00000000-0000-4000-8000-000000000051' as never,
    ),
    undefined,
  );
});
