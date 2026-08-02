import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InMemoryArtifactExportRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-export-repository.adapter.js';
import { InMemoryArtifactLineageRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-lineage-repository.adapter.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { ArtifactExportService } from '../../../src/features/iae/application/artifact-export.service.js';
import { ArtifactGovernanceService } from '../../../src/features/iae/application/artifact-governance.service.js';
import { ArtifactService } from '../../../src/features/iae/application/artifact.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000731';
const workspaceId = '00000000-0000-4000-8000-000000000732';
const artifactId = '00000000-0000-4000-8000-000000000733';
const versionId = '00000000-0000-4000-8000-000000000734';

function context(key: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000735',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000736',
    idempotencyKey: key,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

void test('[IAE-018] export service creates an idempotent manifest with exact evidence and lineage', async () => {
  const artifacts = new InMemoryArtifactRepositoryAdapter();
  const lineage = new InMemoryArtifactLineageRepositoryAdapter();
  const tenantContext = context('export-artifact');
  await new ArtifactService(artifacts).register(tenantContext, {
    version: {
      artifactId,
      versionId,
      tenantScope: tenantContext.tenantScope,
      sourceKind: 'GENERATED',
      dataMode: 'Hybrid',
      contentSha256: 'e'.repeat(64),
      byteSize: 10,
      mediaType: 'text/csv',
      displayName: 'derived.csv',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    placement: {
      placementId: '00000000-0000-4000-8000-000000000737',
      tenantScope: tenantContext.tenantScope,
      kind: 'CLOUD',
      opaqueReference: 'cloud-placement-000004',
      contentSha256: 'e'.repeat(64),
    },
    evidence: {
      evidenceId: '00000000-0000-4000-8000-000000000738',
      tenantScope: tenantContext.tenantScope,
      coordinate: { kind: 'ROW', row: 1 },
    },
  });
  const governance = new ArtifactGovernanceService(lineage);
  await governance.registerLineage(tenantContext, {
    lineageId: '00000000-0000-4000-8000-000000000739',
    derivedArtifactVersionId: versionId,
    tenantScope: tenantContext.tenantScope,
    sourceArtifactVersionIds: ['00000000-0000-4000-8000-000000000740'],
    sourceTenantScopes: [tenantContext.tenantScope],
    processorVersion: 'spreadsheet-auditor@1',
    coordinateLineage: [],
  });
  const service = new ArtifactExportService(
    new InMemoryArtifactExportRepositoryAdapter(),
    new ArtifactService(artifacts),
    lineage,
  );
  const created = await service.create(tenantContext, {
    manifestId: '00000000-0000-4000-8000-000000000741',
    versionIds: [versionId],
    approvalState: 'APPROVED',
    createdAt: '2026-01-03T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.deepEqual(created.value.entries[0]?.evidenceIds, ['00000000-0000-4000-8000-000000000738']);
  assert.deepEqual(created.value.entries[0]?.processorVersions, ['spreadsheet-auditor@1']);
  const repeated = await service.create(tenantContext, {
    manifestId: '00000000-0000-4000-8000-000000000741',
    versionIds: [versionId],
    approvalState: 'APPROVED',
    createdAt: '2026-01-03T00:00:00.000Z',
  });
  assert.deepEqual(repeated, created);
});
