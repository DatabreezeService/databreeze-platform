import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemorySourceCatalogRepositoryAdapter } from '../../../src/features/dda/source-catalog/adapter/in-memory-source-catalog-repository.adapter.js';
import { SourceCatalogService } from '../../../src/features/dda/source-catalog/application/source-catalog.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000901',
  workspace: '00000000-0000-4000-8000-000000000902',
  siblingWorkspace: '00000000-0000-4000-8000-000000000903',
  dataset: '00000000-0000-4000-8000-000000000904',
  sourceA: '00000000-0000-4000-8000-000000000905',
  sourceB: '00000000-0000-4000-8000-000000000906',
  sourceRestricted: '00000000-0000-4000-8000-000000000907',
  versionA: '00000000-0000-4000-8000-000000000908',
  versionB: '00000000-0000-4000-8000-000000000909',
  actor: '00000000-0000-4000-8000-00000000090a',
  correlation: '00000000-0000-4000-8000-00000000090b',
  iaeA: '00000000-0000-4000-8000-00000000090c',
  iaeB: '00000000-0000-4000-8000-00000000090d',
};

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid source catalog identifier');
  return parsed.value;
}

function context(workspaceId = ids.workspace, key = 'source-catalog') {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(workspaceId),
    },
    actorId: stable(ids.actor),
    correlationId: stable(ids.correlation),
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid source catalog context');
  return result.value;
}

function seedRepository() {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([
    {
      id: stable(ids.sourceA),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.iaeA),
      sourceType: 'CSV',
      safeDisplayLabel: 'Doanh thu T1',
      status: 'ACTIVE',
      health: 'HEALTHY',
      versionId: stable(ids.versionA),
      dataMode: 'CLOUD',
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z',
    },
    {
      id: stable(ids.sourceB),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.iaeB),
      sourceType: 'XLSX',
      safeDisplayLabel: 'Chi phi T1',
      status: 'REVIEW',
      health: 'WARNING',
      versionId: stable(ids.versionB),
      dataMode: 'CLOUD',
      revision: 1,
      updatedAt: '2026-08-12T00:01:00.000Z',
    },
    {
      id: stable(ids.sourceRestricted),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.iaeA),
      sourceType: 'PDF',
      safeDisplayLabel: 'Bi mat',
      status: 'ACTIVE',
      health: 'HEALTHY',
      versionId: stable(ids.versionA),
      dataMode: 'LOCAL',
      revision: 1,
      updatedAt: '2026-08-12T00:02:00.000Z',
      deniedPrincipalIds: [stable(ids.actor)],
    },
  ]);
  return repository;
}

void test('[DDA-052] lists multiple authorized sources for one logical dataset with stable cursor pages', async () => {
  const service = new SourceCatalogService(seedRepository());
  const first = await service.listDatasetSources(context(), ids.dataset, undefined, 1);
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.value.entries.length, 1);
  assert.equal(first.value.entries[0]?.sourceId, stable(ids.sourceB));
  assert.ok(first.value.page.nextCursor);
  const second = await service.listDatasetSources(
    context(ids.workspace, 'page-2'),
    ids.dataset,
    first.value.page.nextCursor,
    10,
  );
  assert.equal(second.accepted, true);
  if (!second.accepted) return;
  assert.equal(second.value.entries.length, 1);
  assert.equal(second.value.entries[0]?.sourceId, stable(ids.sourceA));
  assert.equal(second.value.page.nextCursor, undefined);
});

void test('[DDA-052, DSM-018] missing or restricted sources are non-enumerating denials', async () => {
  const service = new SourceCatalogService(seedRepository());
  assert.deepEqual(await service.listDatasetSources(context(), '00000000-0000-4000-8000-000000000999'), {
    accepted: false,
    code: 'NOT_FOUND',
  });
  const listed = await service.listDatasetSources(context(), ids.dataset, undefined, 50);
  assert.equal(listed.accepted, true);
  if (!listed.accepted) return;
  assert.equal(
    listed.value.entries.some((entry) => entry.sourceId === stable(ids.sourceRestricted)),
    false,
  );
});

void test('[DDA-052, DSO-002] LOCAL originals never serialize a Desktop path and open on source device', async () => {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([
    {
      id: stable(ids.sourceRestricted),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.iaeA),
      sourceType: 'CSV',
      safeDisplayLabel: 'May tinh ban',
      status: 'ACTIVE',
      health: 'HEALTHY',
      versionId: stable(ids.versionA),
      dataMode: 'LOCAL',
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z',
    },
  ]);
  const service = new SourceCatalogService(repository);
  const listed = await service.listDatasetSources(context(), ids.dataset, undefined, 10);
  assert.equal(listed.accepted, true);
  if (!listed.accepted) return;
  const serialized = JSON.stringify(listed.value);
  assert.equal(/\\\\|C:\/|localPath|absolutePath|"path"/i.test(serialized), false);
  assert.equal(listed.value.entries[0]?.originalAction, 'OPEN_ON_SOURCE_DEVICE');
});

void test('[DDA-052, IAM-009] sibling workspace dataset IDs resolve as not found', async () => {
  const service = new SourceCatalogService(seedRepository());
  assert.deepEqual(
    await service.listDatasetSources(context(ids.siblingWorkspace), ids.dataset),
    { accepted: false, code: 'NOT_FOUND' },
  );
});
