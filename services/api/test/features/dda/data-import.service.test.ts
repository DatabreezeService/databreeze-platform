import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createDdaAiEgressPolicyV1 } from '@databreeze/domain/data-to-dashboard/policy-v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryDatasetVersionRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-version-repository.adapter.js';
import { InMemoryGovernedDatasetRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-governed-dataset-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { ObjectStorageArtifactProcessingContentAdapter } from '../../../src/features/iae/adapter/object-storage-artifact-processing-content.adapter.js';
import { InMemoryDataImportRepositoryAdapter } from '../../../src/features/dda/etl/adapter/in-memory-data-import-repository.adapter.js';
import { DataImportServiceV1 } from '../../../src/features/dda/etl/application/data-import.service.js';
import { MappingAssistanceServiceV1 } from '../../../src/features/dda/etl/application/mapping-assistance.service.js';
import { DDA_WEB_INTAKE_PROFILE_V1 } from '../../../src/features/dda/intake/application/intake-profile.port.js';
import { composeDdaIaePortFromArtifactRepository } from '../../../src/platform/dda-foundation.composition.js';
import type {
  WebIntakeServiceV1,
  WebIntakeUploadInputV1,
} from '../../../src/features/dda/intake/application/web-intake.service.js';
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

async function createService(
  csv = 'name,amount\nalpha,10\nbeta,20\n',
  options: {
    readonly bytes?: Uint8Array;
    readonly composedIae?: boolean;
    readonly legacySourceWithoutEncoding?: boolean;
  } = {},
) {
  const bytes = options.bytes ?? new TextEncoder().encode(csv);
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
  let mappingRequest: unknown;
  const mappingPolicy = createDdaAiEgressPolicyV1({
    policyId: '00000000-0000-4000-8000-000000000110',
    tenantScope: currentContext.tenantScope,
    enabled: true,
    locality: 'CLOUD',
    purposeAllowlist: ['MAPPING_SUGGESTION'],
    adapterAllowlist: ['openai-responses'],
    allowMetadata: true,
    allowSamples: true,
    allowResultRows: false,
    allowEvidence: false,
    retentionDays: 1,
    maximumPayloadBytes: 32_768,
  });
  assert.equal(mappingPolicy.accepted, true);
  if (!mappingPolicy.accepted) throw new Error('invalid mapping policy');
  const mappingAssistance = new MappingAssistanceServiceV1(
    {
      isAvailable: async () => true,
      suggestMappings: async (request) => {
        mappingRequest = request;
        return {
          status: 'PROPOSED' as const,
          suggestions: [
            {
              label: 'Trim names',
              summary: 'Trim surrounding spaces before review.',
              sourceField: 'name',
              targetField: 'name',
              transformKind: 'TRIM_TEXT',
              alternatives: [],
              rationale: 'The sample contains surrounding spaces.',
              uncertainty: 'LOW' as const,
              authoritative: false as const,
            },
          ],
        };
      },
    },
    {
      policyStore: {
        getPolicy: () => mappingPolicy.value,
        isTenantRevoked: () => false,
      },
      killSwitchEnv: () => 'true',
    },
  );
  const iae =
    options.composedIae === true
      ? composeDdaIaePortFromArtifactRepository(
          artifacts as never,
          new ObjectStorageArtifactProcessingContentAdapter({
            loadVersion: async (input) => {
              const tenantScope = input.tenantScope;
              const currentTenantScope = currentContext.tenantScope;
              if (
                tenantScope.scopeType !== 'workspace' ||
                currentTenantScope.scopeType !== 'workspace'
              ) {
                return undefined;
              }
              return input.artifactVersionId === artifactVersionId &&
                tenantScope.organizationId === currentTenantScope.organizationId &&
                tenantScope.workspaceId === currentTenantScope.workspaceId
                ? Object.freeze({
                    artifactVersionId,
                    tenantScope: currentContext.tenantScope,
                    contentSha256,
                    mediaType: 'text/csv',
                    bytes,
                  })
                : undefined;
            },
          }),
        )
      : {
          requireArtifactVersion: async () => undefined,
          requireEvidenceReference: async () => undefined,
          addRetentionConstraint: async () => undefined,
          openProcessingContent: async () =>
            Object.freeze({
              accepted: true as const,
              value: Object.freeze({
                artifactVersionId,
                tenantScope: currentContext.tenantScope,
                contentSha256,
                mediaType: 'text/csv',
                byteLength: bytes.byteLength,
                bytes,
              }),
            }),
        };
  const dataImports = new InMemoryDataImportRepositoryAdapter();
  const imports =
    options.legacySourceWithoutEncoding === true
      ? {
          save: async (record: Parameters<typeof dataImports.save>[0], expectedRevision?: number) =>
            dataImports.save(
              Object.freeze({
                ...record,
                sources: Object.freeze(
                  record.sources.map((source) => {
                    const { declaredEncoding, ...legacySource } = source as typeof source & {
                      readonly declaredEncoding?: string;
                    };
                    void declaredEncoding;
                    return Object.freeze(legacySource);
                  }),
                ),
              }),
              expectedRevision,
            ),
          findById: dataImports.findById.bind(dataImports),
          list: dataImports.list.bind(dataImports),
        }
      : dataImports;
  const service = new DataImportServiceV1({
    imports,
    webIntake,
    governedDatasets: new InMemoryGovernedDatasetRepositoryAdapter(),
    datasetVersions: new InMemoryDatasetVersionRepositoryAdapter(),
    artifacts: artifacts as never,
    artifactIntake: intakeRepository as never,
    sourceCatalogRegistration: sourceCatalog,
    iae,
    mappingAssistance,
  });
  return {
    service,
    bytes,
    currentContext,
    sourceCatalog,
    getMappingRequest: () => mappingRequest,
  };
}

void test('[DDA-053] preserves a typed file-too-large rejection from intake', async () => {
  const service = new DataImportServiceV1({
    imports: new InMemoryDataImportRepositoryAdapter(),
    webIntake: {
      uploadFile: async () =>
        Object.freeze({
          accepted: false as const,
          code: 'DDA_INTAKE_LIMIT_SIZE' as const,
        }),
    } as unknown as WebIntakeServiceV1,
  });
  const currentContext = context('import-too-large');
  const bytes = new TextEncoder().encode('name,amount\nalpha,10\n');
  const result = await service.create({
    context: currentContext,
    destination: 'NEW_DATASET',
    datasetName: 'Too large',
    idempotencyKey: 'import-too-large',
    files: [{ fileName: 'large.csv', claimedMediaType: 'text/csv', bytes }],
  });
  assert.deepEqual(result, { accepted: false, code: 'DDA_INTAKE_LIMIT_SIZE' });
});

void test('[DDA-053] approval exposes a bounded dashboard preview while publication remains separate', async () => {
  const { service, bytes, sourceCatalog, currentContext } = await createService();
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
  assert.equal(approved.value.accepted.dashboardStatus, 'BUILDING');
  assert.equal(approved.value.accepted.approvalIdempotencyKey, 'approve-1');
  const catalog = await sourceCatalog.listByDataset(
    context('catalog-read'),
    stable(approved.value.accepted.datasetId),
  );
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0]?.safeDisplayLabel, 'sales.csv');
  assert.equal(catalog[0]?.sourceType, 'CSV');
  assert.equal(catalog[0]?.status, 'ACTIVE');

  const listed = await service.list(currentContext.tenantScope, 10);
  assert.equal(listed.length, 1);
  assert.equal('tenantScope' in (listed[0] ?? {}), false);
  assert.equal('payloadFingerprint' in (listed[0] ?? {}), false);
  const loaded = await service.get(created.value.importId, currentContext.tenantScope);
  assert.equal(loaded.accepted, true);
  if (loaded.accepted) {
    assert.equal('tenantScope' in loaded.value, false);
    assert.equal('payloadFingerprint' in loaded.value, false);
  }

  const preview = await service.dashboardPreview({
    importId: created.value.importId,
    context: context('preview-1'),
  });
  assert.equal(preview.accepted, true);
  if (!preview.accepted) return;
  assert.equal(preview.value.datasetVersionId, approved.value.accepted.datasetVersionId);
  assert.equal(preview.value.rowCount, 2);
  assert.equal(preview.value.measure?.field, 'amount');
  assert.equal(preview.value.measure?.sum, 30);
  assert.equal(preview.value.dimension?.field, 'name');
  assert.equal(preview.value.sampleRows.length, 2);

  const replay = await service.approve({
    importId: created.value.importId,
    context: context('approve-replay'),
    expectedRevision: created.value.revision,
    idempotencyKey: 'approve-1',
  });
  assert.equal(replay.accepted, true);
  if (replay.accepted) {
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.value, approved.value);
  }

  const conflict = await service.approve({
    importId: created.value.importId,
    context: context('approve-2'),
    expectedRevision: approved.value.revision,
    idempotencyKey: 'approve-2',
  });
  assert.deepEqual(conflict, { accepted: false, code: 'DDA_IMPORT_CONFLICT' });
});

void test('[DDA-053] preview deterministically truncates an approved CSV above the output bound', async () => {
  const csv = `name,amount\n${Array.from(
    { length: 20_001 },
    (_, index) => `item-${index + 1},${index + 1}`,
  ).join('\n')}\n`;
  const { service, bytes } = await createService(csv);
  const created = await service.create({
    context: context('import-large-preview'),
    destination: 'NEW_DATASET',
    datasetName: 'Large preview',
    idempotencyKey: 'import-large-preview',
    files: [{ fileName: 'large-preview.csv', claimedMediaType: 'text/csv', bytes }],
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const approved = await service.approve({
    importId: created.value.importId,
    context: context('approve-large-preview'),
    expectedRevision: created.value.revision,
    idempotencyKey: 'approve-large-preview',
  });
  assert.equal(approved.accepted, true);
  if (!approved.accepted) return;

  const preview = await service.dashboardPreview({
    importId: created.value.importId,
    context: context('preview-large-preview'),
  });

  assert.equal(preview.accepted, true);
  if (!preview.accepted) return;
  assert.equal(preview.value.rowCount, 20_000);
  assert.equal(preview.value.truncated, true);
  assert.equal(preview.value.measure?.field, 'amount');
  assert.equal(preview.value.measure?.sum, 200_010_000);
  assert.equal(preview.value.measure?.maximum, 20_000);
});

void test('[DDA-053] preview does not mark an exact output-bound CSV as truncated', async () => {
  const csv = `name,amount\n${Array.from(
    { length: 20_000 },
    (_, index) => `item-${index + 1},${index + 1}`,
  ).join('\n')}\n`;
  const { service, bytes } = await createService(csv);
  const created = await service.create({
    context: context('import-exact-preview-bound'),
    destination: 'NEW_DATASET',
    datasetName: 'Exact preview bound',
    idempotencyKey: 'import-exact-preview-bound',
    files: [{ fileName: 'exact-preview-bound.csv', claimedMediaType: 'text/csv', bytes }],
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const approved = await service.approve({
    importId: created.value.importId,
    context: context('approve-exact-preview-bound'),
    expectedRevision: created.value.revision,
    idempotencyKey: 'approve-exact-preview-bound',
  });
  assert.equal(approved.accepted, true);
  if (!approved.accepted) return;

  const preview = await service.dashboardPreview({
    importId: created.value.importId,
    context: context('preview-exact-preview-bound'),
  });

  assert.equal(preview.accepted, true);
  if (!preview.accepted) return;
  assert.equal(preview.value.rowCount, 20_000);
  assert.equal(preview.value.truncated, false);
  assert.equal(preview.value.measure?.sum, 200_010_000);
  assert.equal(preview.value.measure?.maximum, 20_000);
});

void test('[DDA-053] preview recognizes bounded currency and locale number formats', async () => {
  const { service } = await createService(
    'name,amount\nalpha,"₫1,240,000"\nbeta,"1.240.000"\ngamma,"12,5"\n',
  );
  const created = await service.create({
    context: context('import-number-formats'),
    destination: 'NEW_DATASET',
    datasetName: 'Number formats',
    idempotencyKey: 'import-number-formats',
    files: [
      {
        fileName: 'number-formats.csv',
        claimedMediaType: 'text/csv',
        bytes: new TextEncoder().encode(
          'name,amount\nalpha,"₫1,240,000"\nbeta,"1.240.000"\ngamma,"12,5"\n',
        ),
      },
    ],
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const approved = await service.approve({
    importId: created.value.importId,
    context: context('approve-number-formats'),
    expectedRevision: created.value.revision,
    idempotencyKey: 'approve-number-formats',
  });
  assert.equal(approved.accepted, true);
  if (!approved.accepted) return;
  const preview = await service.dashboardPreview({
    importId: created.value.importId,
    context: context('preview-number-formats'),
  });
  assert.equal(preview.accepted, true);
  if (!preview.accepted) return;
  assert.equal(preview.value.measure?.field, 'amount');
  assert.equal(preview.value.measure?.sum, 2_480_012.5);
  assert.equal(preview.value.measure?.minimum, 12.5);
  assert.equal(preview.value.measure?.maximum, 1_240_000);
});

void test('[DDA-053][DDA-009] server review derives a bounded normalization projection without mutating source bytes', async () => {
  const { service } = await createService();
  const bytes = new TextEncoder().encode('name,amount\n  alpha  ,10\n beta,20\n');
  const created = await service.create({
    context: context('import-normalize'),
    destination: 'NEW_DATASET',
    datasetName: 'Normalization preview',
    idempotencyKey: 'import-normalize',
    files: [{ fileName: 'dirty.csv', claimedMediaType: 'text/csv', bytes }],
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.deepEqual(created.value.review.beforeSample[0], { name: '  alpha  ', amount: 10 });
  assert.deepEqual(created.value.review.afterSample[0], { name: 'alpha', amount: 10 });
  assert.equal(created.value.review.counts.changed, 2);
  assert.match(created.value.review.warnings.join(' '), /xem trước/u);
});

void test('[DDA-005/006/008/010/011/036/043-045] mapping suggestions require consent and remain advisory', async () => {
  const { service, bytes, currentContext, getMappingRequest } = await createService();
  const created = await service.create({
    context: currentContext,
    destination: 'NEW_DATASET',
    datasetName: 'Mapping review',
    idempotencyKey: 'mapping-review',
    files: [{ fileName: 'sales.csv', claimedMediaType: 'text/csv', bytes }],
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const denied = await service.mappingSuggestions({
    importId: created.value.importId,
    context: context('mapping-denied'),
    samplePermissionGranted: false,
    locale: 'vi',
  });
  assert.deepEqual(denied, { accepted: false, code: 'SAMPLE_PERMISSION_DENIED' });

  const suggested = await service.mappingSuggestions({
    importId: created.value.importId,
    context: context('mapping-accepted'),
    samplePermissionGranted: true,
    locale: 'vi',
  });
  assert.equal(suggested.accepted, true);
  if (suggested.accepted) {
    assert.equal(suggested.value.authoritative, false);
    assert.equal(suggested.value.suggestions[0]?.sourceField, 'name');
  }
  const request = getMappingRequest() as {
    readonly tenantScope: unknown;
    readonly boundedSamples: readonly unknown[];
  };
  assert.deepEqual(request.tenantScope, currentContext.tenantScope);
  assert.equal(request.boundedSamples.length, 2);
});

function createIntakeOnlyService(
  uploadFile: (
    input: WebIntakeUploadInputV1,
  ) => ReturnType<WebIntakeServiceV1['uploadFile']> = async () =>
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
) {
  return new DataImportServiceV1({
    imports: new InMemoryDataImportRepositoryAdapter(),
    webIntake: { uploadFile } as unknown as WebIntakeServiceV1,
  });
}

function createInput(
  bytes: Uint8Array,
  idempotencyKey: string,
  declaredEncoding?: 'utf-8' | 'utf-8-sig' | 'windows-1258',
) {
  return {
    context: context(idempotencyKey),
    destination: 'NEW_DATASET' as const,
    datasetName: 'Encoding review',
    idempotencyKey,
    files: [
      {
        fileName: 'encoding.csv',
        claimedMediaType: 'text/csv',
        bytes,
        ...(declaredEncoding === undefined ? {} : { declaredEncoding }),
      },
    ],
  };
}

void test('[DDA-002][WEB-021] declared canonical encoding drives profiling and Web intake', async () => {
  let received: WebIntakeUploadInputV1 | undefined;
  const service = createIntakeOnlyService(async (input) => {
    received = input;
    return Object.freeze({
      accepted: true as const,
      value: Object.freeze({
        sessionId,
        artifactVersionId,
        status: 'PENDING_REVIEW' as const,
        profileId: 'dda.web.tabular.v1' as const,
        replayed: false,
      }),
    });
  });
  const bytes = Uint8Array.from(Buffer.from('name,price\r\nitem,\xa310\r\n', 'latin1'));

  const result = await service.create(createInput(bytes, 'encoding-windows-1258', 'windows-1258'));

  assert.equal(result.accepted, true);
  assert.equal(received?.declaredEncoding, 'windows-1258');
  if (result.accepted) assert.equal(result.value.sources[0]?.declaredEncoding, 'windows-1258');
});

void test('[DDA-002][DDA-053][IAE-022] composed processing content preserves an approved Windows-1258 preview', async () => {
  const bytes = Uint8Array.from(Buffer.from('name,amount\r\nitem,\xa310\r\n', 'latin1'));
  const { service } = await createService('', { bytes, composedIae: true });
  const created = await service.create({
    ...createInput(bytes, 'composed-windows-1258-preview', 'windows-1258'),
    datasetName: 'Windows-1258 preview',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const approved = await service.approve({
    importId: created.value.importId,
    context: context('approve-composed-windows-1258-preview'),
    expectedRevision: created.value.revision,
    idempotencyKey: 'approve-composed-windows-1258-preview',
  });
  assert.equal(approved.accepted, true);
  if (!approved.accepted) return;

  const preview = await service.dashboardPreview({
    importId: created.value.importId,
    context: context('preview-composed-windows-1258-preview'),
  });
  assert.equal(preview.accepted, true);
  if (!preview.accepted) return;
  assert.equal(preview.value.rowCount, 1);
  assert.deepEqual(preview.value.sampleRows, [{ name: 'item', amount: 10 }]);
});

void test('[DDA-002][DDA-053][IAE-022] composed processing content supports approved legacy Windows-1258 sources', async () => {
  const bytes = Uint8Array.from(Buffer.from('name,amount\r\nitem,\xa310\r\n', 'latin1'));
  const { service } = await createService('', {
    bytes,
    composedIae: true,
    legacySourceWithoutEncoding: true,
  });
  const created = await service.create({
    ...createInput(bytes, 'legacy-windows-1258-preview', 'windows-1258'),
    datasetName: 'Legacy Windows-1258 preview',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const approved = await service.approve({
    importId: created.value.importId,
    context: context('approve-legacy-windows-1258-preview'),
    expectedRevision: created.value.revision,
    idempotencyKey: 'approve-legacy-windows-1258-preview',
  });
  assert.equal(approved.accepted, true);
  if (!approved.accepted) return;

  const preview = await service.dashboardPreview({
    importId: created.value.importId,
    context: context('preview-legacy-windows-1258-preview'),
  });
  assert.equal(preview.accepted, true);
  if (!preview.accepted) return;
  assert.deepEqual(preview.value.sampleRows, [{ name: 'item', amount: 10 }]);
});

void test('[DDA-002][WEB-021] malformed and unsupported encodings remain exact problems', async () => {
  const service = createIntakeOnlyService();
  const malformed = await service.create(
    createInput(Uint8Array.from([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0xc3, 0x28]), 'malformed'),
  );
  assert.deepEqual(malformed, { accepted: false, code: 'DDA_INTAKE_MALFORMED_ENCODING' });

  const unsupported = await service.create({
    ...createInput(new TextEncoder().encode('name\nitem\n'), 'unsupported'),
    files: [
      {
        fileName: 'encoding.csv',
        claimedMediaType: 'text/csv',
        bytes: new TextEncoder().encode('name\nitem\n'),
        declaredEncoding: 'windows-1252' as never,
      },
    ],
  });
  assert.deepEqual(unsupported, { accepted: false, code: 'DDA_INTAKE_UNSUPPORTED_ENCODING' });
});

void test('[DDA-002][WEB-021] row and column bounds use the authoritative intake profile', async () => {
  const service = createIntakeOnlyService();
  const excessiveRows = new TextEncoder().encode(
    `value\n${'x\n'.repeat(DDA_WEB_INTAKE_PROFILE_V1.limits.maxRows + 1)}`,
  );
  const rowResult = await service.create(createInput(excessiveRows, 'row-limit'));
  assert.deepEqual(rowResult, { accepted: false, code: 'DDA_INTAKE_LIMIT_ROWS' });

  const excessiveColumns = new TextEncoder().encode(
    `${Array.from(
      { length: DDA_WEB_INTAKE_PROFILE_V1.limits.maxColumns + 1 },
      (_, index) => `column-${index}`,
    ).join(',')}\n`,
  );
  const columnResult = await service.create(createInput(excessiveColumns, 'column-limit'));
  assert.deepEqual(columnResult, { accepted: false, code: 'DDA_INTAKE_LIMIT_COLUMNS' });
});

void test('[DDA-002][WEB-021] exact intake profile failures are not collapsed to unavailable', async () => {
  const service = createIntakeOnlyService(async () =>
    Object.freeze({ accepted: false as const, code: 'DDA_INTAKE_LIMIT_ROWS' as const }),
  );
  const result = await service.create(
    createInput(new TextEncoder().encode('name\nitem\n'), 'intake-row-limit'),
  );
  assert.deepEqual(result, { accepted: false, code: 'DDA_INTAKE_LIMIT_ROWS' });
});

void test('[DDA-002][WEB-021] declared encoding participates in import replay identity', async () => {
  const service = createIntakeOnlyService();
  const bytes = new TextEncoder().encode('name\nitem\n');
  const first = await service.create(createInput(bytes, 'encoding-fingerprint', 'utf-8'));
  assert.equal(first.accepted, true);

  const changedEncoding = await service.create(
    createInput(bytes, 'encoding-fingerprint', 'windows-1258'),
  );
  assert.deepEqual(changedEncoding, { accepted: false, code: 'DDA_IMPORT_CONFLICT' });
});
