/* eslint-disable @typescript-eslint/require-await -- deterministic IAE authority double. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemorySourceCatalogRepositoryAdapter } from '../../../src/features/dda/source-catalog/adapter/in-memory-source-catalog-repository.adapter.js';
import type { SourceCatalogRepositoryPortV1 } from '../../../src/features/dda/source-catalog/application/source-catalog-repository.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  createTestOriginalViewService,
  createTestSourceCatalogService,
} from './source-catalog.test-support.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000a01',
  workspace: '00000000-0000-4000-8000-000000000a02',
  otherWorkspace: '00000000-0000-4000-8000-000000000a14',
  dataset: '00000000-0000-4000-8000-000000000a03',
  otherDataset: '00000000-0000-4000-8000-000000000a15',
  csv: '00000000-0000-4000-8000-000000000a04',
  xlsx: '00000000-0000-4000-8000-000000000a05',
  image: '00000000-0000-4000-8000-000000000a06',
  local: '00000000-0000-4000-8000-000000000a07',
  stale: '00000000-0000-4000-8000-000000000a08',
  version: '00000000-0000-4000-8000-000000000a09',
  iae: '00000000-0000-4000-8000-000000000a0a',
  staleIae: '00000000-0000-4000-8000-000000000a0b',
  actor: '00000000-0000-4000-8000-000000000a0c',
  correlation: '00000000-0000-4000-8000-000000000a0d',
};

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid original view identifier');
  return parsed.value;
}

function context(key = 'original-view') {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
    },
    actorId: stable(ids.actor),
    correlationId: stable(ids.correlation),
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid original view context');
  return result.value;
}

function otherWorkspaceContext() {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.otherWorkspace),
    },
    actorId: stable(ids.actor),
    correlationId: stable(ids.correlation),
    idempotencyKey: 'foreign-workspace',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid foreign workspace context');
  return result.value;
}

function seed() {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([
    {
      id: stable(ids.csv),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.iae),
      sourceType: 'CSV',
      safeDisplayLabel: 'Bang CSV',
      status: 'ACTIVE',
      health: 'HEALTHY',
      versionId: stable(ids.version),
      dataMode: 'CLOUD',
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z',
      previewKind: 'CSV_SAFE_GRID',
    },
    {
      id: stable(ids.xlsx),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.iae),
      sourceType: 'XLSX',
      safeDisplayLabel: 'Bang XLSX',
      status: 'ACTIVE',
      health: 'HEALTHY',
      versionId: stable(ids.version),
      dataMode: 'CLOUD',
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z',
      previewKind: 'XLSX_SAFE_GRID',
      hasMacros: true,
      hasExternalLinks: true,
    },
    {
      id: stable(ids.image),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.iae),
      sourceType: 'IMAGE',
      safeDisplayLabel: 'Hoa don',
      status: 'ACTIVE',
      health: 'HEALTHY',
      versionId: stable(ids.version),
      dataMode: 'CLOUD',
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z',
      previewKind: 'IMAGE',
      evidenceOverlay: { page: 1, x: 10, y: 20, width: 30, height: 40 },
    },
    {
      id: stable(ids.local),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.iae),
      sourceType: 'CSV',
      safeDisplayLabel: 'Local only',
      status: 'ACTIVE',
      health: 'HEALTHY',
      versionId: stable(ids.version),
      dataMode: 'LOCAL',
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z',
    },
    {
      id: stable(ids.stale),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.staleIae),
      sourceType: 'PDF',
      safeDisplayLabel: 'Stale IAE',
      status: 'ACTIVE',
      health: 'UNKNOWN',
      versionId: stable(ids.version),
      dataMode: 'CLOUD',
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z',
      iaeMissing: true,
    },
  ]);
  return repository;
}

void test('[DDA-052, IAE-007] resolveOriginalView never returns storage credentials or Desktop paths', async () => {
  const repository = seed();
  const service = createTestOriginalViewService(
    createTestSourceCatalogService(repository),
    repository,
  );
  const view = await service.resolveOriginalView(context(), ids.dataset, ids.csv);
  assert.equal(view.accepted, true);
  if (!view.accepted) return;
  assert.equal(view.value.kind, 'CSV_SAFE_GRID');
  assert.equal(view.value.iaeContentReferenceId, stable(ids.iae));
  const serialized = JSON.stringify(view.value);
  assert.equal(/credential|secret|localPath|absolutePath|C:\\/i.test(serialized), false);
});

void test('[DDA-052, IAE-008] cloud source views require the IAE-issued short-lived descriptor', async () => {
  const repository = seed();
  let called = false;
  const service = createTestOriginalViewService(
    createTestSourceCatalogService(repository),
    repository,
    {
      resolveOriginalView: async (_context, input) => {
        called = true;
        assert.equal(input.artifactVersionId, stable(ids.iae));
        return {
          accepted: true,
          value: {
            schemaVersion: 1,
            descriptorId: stable('00000000-0000-4000-8000-000000000a16'),
            artifactVersionId: stable(ids.iae),
            tenantScope: context().tenantScope,
            action: 'OPEN_CLOUD',
            issuedAt: '2026-08-13T00:00:00.000Z' as never,
            expiresAt: '2026-08-13T00:05:00.000Z' as never,
            authorizationEpoch: 1,
            signedDescriptor: 'signed-cloud-descriptor',
          },
        };
      },
    },
  );
  const view = await service.resolveOriginalView(context('iae-cloud'), ids.dataset, ids.csv);
  assert.equal(view.accepted, true);
  assert.equal(called, true);
});

void test('[DDA-052, DSO-002] LOCAL sources resolve as OPEN_ON_SOURCE_DEVICE', async () => {
  const repository = seed();
  const service = createTestOriginalViewService(
    createTestSourceCatalogService(repository),
    repository,
  );
  const view = await service.resolveOriginalView(context('local'), ids.dataset, ids.local);
  assert.equal(view.accepted, true);
  if (!view.accepted) return;
  assert.equal(view.value.kind, 'OPEN_ON_SOURCE_DEVICE');
  assert.equal(/\\|C:\/|localPath|absolutePath|"path"/i.test(JSON.stringify(view.value)), false);
});

void test('[DDA-052] XLSX previews expose formula text and never execute macros or external links', async () => {
  const repository = seed();
  const service = createTestOriginalViewService(
    createTestSourceCatalogService(repository),
    repository,
  );
  const view = await service.resolveOriginalView(context('xlsx'), ids.dataset, ids.xlsx);
  assert.equal(view.accepted, true);
  if (!view.accepted) return;
  assert.equal(view.value.kind, 'XLSX_SAFE_GRID');
  if (view.value.kind !== 'XLSX_SAFE_GRID') return;
  assert.equal(view.value.executedMacros, false);
  assert.equal(view.value.followedExternalLinks, false);
  const xlsxCells = view.value.cells ?? [];
  assert.ok(xlsxCells.some((cell) => cell.formulaText === '=A1+1'));
  assert.ok(xlsxCells.some((cell) => cell.displayValue === '2'));
});

void test('[DDA-052, IAE-013] stale IAE references and off-page evidence fail closed', async () => {
  const repository = seed();
  const service = createTestOriginalViewService(
    createTestSourceCatalogService(repository),
    repository,
  );
  assert.deepEqual(await service.resolveOriginalView(context('stale'), ids.dataset, ids.stale), {
    accepted: false,
    code: 'NOT_FOUND',
  });
  const image = await service.resolveOriginalView(context('image'), ids.dataset, ids.image);
  assert.equal(image.accepted, true);
  if (!image.accepted || image.value.kind !== 'IMAGE') return;
  assert.deepEqual(image.value.evidenceOverlay, {
    page: 1,
    x: 10,
    y: 20,
    width: 30,
    height: 40,
  });
});

void test('[DDA-052] CSV preview preserves formula-like text as untrusted data', async () => {
  const repository = seed();
  const service = createTestOriginalViewService(
    createTestSourceCatalogService(repository),
    repository,
  );
  const view = await service.resolveOriginalView(context('csv-formula'), ids.dataset, ids.csv);
  assert.equal(view.accepted, true);
  if (!view.accepted || view.value.kind !== 'CSV_SAFE_GRID') return;
  const csvCells = view.value.cells ?? [];
  assert.ok(csvCells.some((cell) => cell.rawText === '=CMD|calc'));
  assert.equal(
    csvCells.every((cell) => cell.executed === false),
    true,
  );
});

void test('[DDA-026, IAM-009] original view requires an exact dataset/source binding and tenant scope', async () => {
  const repository = seed();
  const service = createTestOriginalViewService(
    createTestSourceCatalogService(repository),
    repository,
  );

  const correctDataset = await service.resolveOriginalView(
    context('correct-dataset'),
    ids.dataset,
    ids.csv,
  );
  assert.equal(correctDataset.accepted, true);

  assert.deepEqual(
    await service.resolveOriginalView(context('mismatched-dataset'), ids.otherDataset, ids.csv),
    { accepted: false, code: 'NOT_FOUND' },
  );
  assert.deepEqual(
    await service.resolveOriginalView(otherWorkspaceContext(), ids.dataset, ids.csv),
    { accepted: false, code: 'NOT_FOUND' },
  );
});

void test('[DDA-026, IAM-009] invalid route identifiers fail closed before source resolution', async () => {
  const repository = seed();
  const service = createTestOriginalViewService(
    createTestSourceCatalogService(repository),
    repository,
  );

  assert.deepEqual(
    await service.resolveOriginalView(context('invalid-dataset'), 'not-a-stable-id', ids.csv),
    { accepted: false, code: 'INVALID_IDENTIFIER' },
  );
  assert.deepEqual(
    await service.resolveOriginalView(context('invalid-source'), ids.dataset, 'not-a-stable-id'),
    { accepted: false, code: 'INVALID_IDENTIFIER' },
  );
});

void test('[DDA-052] unavailable repository resolution is content-safe', async () => {
  const unavailableRepository: SourceCatalogRepositoryPortV1 = {
    listByDataset: () => Promise.reject(new Error('repository unavailable')),
    findSource: () => Promise.reject(new Error('repository unavailable')),
  };
  const service = createTestOriginalViewService(
    createTestSourceCatalogService(unavailableRepository),
    unavailableRepository,
  );

  assert.deepEqual(
    await service.resolveOriginalView(context('repository-unavailable'), ids.dataset, ids.csv),
    { accepted: false, code: 'UNAVAILABLE' },
  );
});
