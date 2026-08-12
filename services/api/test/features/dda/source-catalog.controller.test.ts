import assert from 'node:assert/strict';
import test from 'node:test';

import { SourceCatalogController } from '../../../src/features/dda/source-catalog/api/source-catalog.controller.js';
import { InMemorySourceCatalogRepositoryAdapter } from '../../../src/features/dda/source-catalog/adapter/in-memory-source-catalog-repository.adapter.js';
import { OriginalViewService } from '../../../src/features/dda/source-catalog/application/original-view.service.js';
import { SourceCatalogService } from '../../../src/features/dda/source-catalog/application/source-catalog.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

const ids = {
  organization: '00000000-0000-4000-8000-000000000b01',
  workspace: '00000000-0000-4000-8000-000000000b02',
  dataset: '00000000-0000-4000-8000-000000000b03',
  source: '00000000-0000-4000-8000-000000000b04',
  version: '00000000-0000-4000-8000-000000000b05',
  iae: '00000000-0000-4000-8000-000000000b06',
  actor: '00000000-0000-4000-8000-000000000b07',
  correlation: '00000000-0000-4000-8000-000000000b08',
};

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid controller fixture');
  return parsed.value;
}

void test('[DDA-052] source catalog controller lists sources through the authenticated tenant context', async () => {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([
    {
      id: stable(ids.source),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.iae),
      sourceType: 'CSV',
      safeDisplayLabel: 'Controller source',
      status: 'ACTIVE',
      health: 'HEALTHY',
      versionId: stable(ids.version),
      dataMode: 'CLOUD',
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z',
    },
  ]);
  const catalog = new SourceCatalogService(repository);
  const originals = new OriginalViewService(catalog, repository);
  const context = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
    },
    actorId: stable(ids.actor),
    correlationId: stable(ids.correlation),
    idempotencyKey: 'controller',
    authorizationEpoch: 1,
  });
  assert.equal(context.accepted, true);
  if (!context.accepted) return;
  const controller = new SourceCatalogController(catalog, originals, {
    resolve: async () => context.value,
  });
  const listed = await controller.listSources({}, ids.dataset, { limit: 10 });
  assert.equal((listed as { accepted: boolean }).accepted, true);
});
