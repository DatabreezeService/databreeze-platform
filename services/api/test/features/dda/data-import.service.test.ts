import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryDatasetVersionRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-version-repository.adapter.js';
import { InMemoryGovernedDatasetRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-governed-dataset-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemoryDataImportRepositoryAdapter } from '../../../src/features/dda/etl/adapter/in-memory-data-import-repository.adapter.js';
import { DataImportServiceV1 } from '../../../src/features/dda/etl/application/data-import.service.js';
import type { WebIntakeServiceV1 } from '../../../src/features/dda/intake/application/web-intake.service.js';
import { InMemorySourceCatalogRepositoryAdapter } from '../../../src/features/dda/source-catalog/adapter/in-memory-source-catalog-repository.adapter.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000003';
const artifactId = '00000000-0000-4000-8000-000000000101';
const artifactVersionId = '00000000-0000-4000-8000-000000000102';
const sessionId = '00000000-0000-4000-8000-000000000103';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

function context(idempotencyKey: string) {
  const created = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId,
    correlationId: '00000000-0000-4000-8000-000000000105',
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid context');
  return created.value;
}

async function createService() {
  const bytes = new TextEncoder().encode('name,amount\nalpha,10\nbeta,20\n');
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const currentContext = context('import-create');
  const artifact = Object.freeze({
    schemaVersion: 1 as const,
    artifactId,
    versionId: artifactVersionId,
    tenantScope: currentContext.tenantScope,
    sourceKind: 'FILE',
    dataMode: 'Cloud',
    contentSha256,
    byteSize: bytes.byteLength,
    mediaType: 'text/csv',
    displayName: 'sales.csv',
    createdAt: '2026-08-17T00:00:00.000Z',
    status: 'QUARANTINED' as const,
    scanState: 'PENDING' as const,
  });
  let inboxItem = Object.freeze({
    schemaVersion: 1 as const,
    inboxItemId: sessionId,
    tenantScope: currentContext.tenantScope,
    idempotencyKey: 'upload:sales.csv',
    artifactVersionId: stable(artifactVersionId),
    state: 'NEW' as const,
    createdAt: '2026-08-17T00:00:00.000Z' as const,
    revision: 1,
  });
  const artifacts = {
    findVersion: async () => artifact,
    updateVersionStatus: async () =>
      Object.freeze({ ...artifact, status: 'ACTIVE' as const, scanState: 'CLEAN' as const }),
  };
  const intakeRepository = {
    withTransaction: async (_context: unknown, work: (transaction: unknown) => Promise<unknown>) =>
      work({
        find: async () => inboxItem,
        save: async (_saveContext: unknown, next: typeof inboxItem) => {
          inboxItem = next;
        },
        findByIdempotency: async () => undefined,
        list: async () => [inboxItem],
      }),
  };

  const webIntake = {
    uploadFile: async () =>
      Object.freeze({
        accepted: true as const,
        value: Object.freeze({
          sessionId,
          artifactVersionId,
          status: 'PENDING_REVIEW' as const,
          profileId: 'dda.web.tabular.v1' as const,
          replayed: false,
        }),
      }),
  } as unknown as WebIntakeServiceV1;
  const sourceCatalog = new InMemorySourceCatalogRepositoryAdapter();
  const service = new DataImportServiceV1({
    imports: new InMemoryDataImportRepositoryAdapter(),
    webIntake,
    governedDatasets: new InMemoryGovernedDatasetRepositoryAdapter(),
    datasetVersions: new InMemoryDatasetVersionRepositoryAdapter(),
    artifacts: artifacts as never,
    artifactIntake: intakeRepository as never,
    sourceCatalogRegistration: sourceCatalog,
  });
  return { service, bytes, currentContext, sourceCatalog };
}

void test('[DDA-053] approval is honest when no starter dashboard worker is composed', async () => {
  const { service, bytes, sourceCatalog } = await createService();
  const created = await service.create({
    context: context('import-create'),
    destination: 'NEW_DATASET',
    datasetName: 'Sales',
    idempotencyKey: 'import-create',
    files: [{ fileName: 'sales.csv', claimedMediaType: 'text/csv', bytes }],
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const approved = await service.approve({
    importId: created.value.importId,
    context: context('approve-1'),
    expectedRevision: created.value.revision,
    idempotencyKey: 'approve-1',
  });
  assert.equal(approved.accepted, true);
  if (!approved.accepted || approved.value.accepted === undefined) return;
  assert.equal(approved.value.accepted.dashboardStatus, 'UNAVAILABLE');
  assert.equal(approved.value.accepted.approvalIdempotencyKey, 'approve-1');
  const catalog = await sourceCatalog.listByDataset(
    context('catalog-read'),
    stable(approved.value.accepted.datasetId),
  );
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0]?.safeDisplayLabel, 'sales.csv');
  assert.equal(catalog[0]?.sourceType, 'CSV');
  assert.equal(catalog[0]?.status, 'ACTIVE');

  const conflict = await service.approve({
    importId: created.value.importId,
    context: context('approve-2'),
    expectedRevision: approved.value.revision,
    idempotencyKey: 'approve-2',
  });
  assert.deepEqual(conflict, { accepted: false, code: 'DDA_IMPORT_CONFLICT' });
});
