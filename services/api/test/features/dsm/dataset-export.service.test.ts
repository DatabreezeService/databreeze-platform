import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InMemoryDatasetExportRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-export-repository.adapter.js';
import { InMemoryDatasetVersionRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-version-repository.adapter.js';
import { DatasetExportService } from '../../../src/features/dsm/application/dataset-export.service.js';
import { DatasetVersionService } from '../../../src/features/dsm/application/dataset-version.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'dataset-export-service',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const versionId = '55555555-5555-4555-8555-555555555555';
const datasetId = '66666666-6666-4666-8666-666666666666';

void test('[DSM-022] export service requires an existing governed dataset version', async () => {
  const versions = new InMemoryDatasetVersionRepositoryAdapter();
  const versionService = new DatasetVersionService(versions);
  const registered = await versionService.register(context, {
    datasetId,
    versionId,
    tenantScope: context.tenantScope,
    inputArtifactVersionIds: [],
    schemaVersionId: '77777777-7777-4777-8777-777777777777',
    mappingVersionId: '88888888-8888-4888-8888-888888888888',
    ruleSetVersionId: '99999999-9999-4999-8999-999999999999',
    engineBuild: 'engine-1',
    contentFingerprint: 'a'.repeat(64),
    rowCount: 2,
    qualityState: 'PASS',
    lineageManifestHash: 'b'.repeat(64),
  });
  assert.equal(registered.accepted, true);
  const service = new DatasetExportService(new InMemoryDatasetExportRepositoryAdapter(), versions);
  const missing = await service.create(context, {
    manifestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    datasetId,
    datasetVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    dataMode: 'HYBRID',
    payloadClass: 'GOVERNED_DATA',
    format: 'JSONL',
    rowCount: 2,
    byteSize: 100,
    contentSha256: 'c'.repeat(64),
    schemaVersionId: '77777777-7777-4777-8777-777777777777',
    mappingVersionId: '88888888-8888-4888-8888-888888888888',
    ruleSetVersionId: '99999999-9999-4999-8999-999999999999',
    semanticManifestHash: 'd'.repeat(64),
    metricManifestHash: 'e'.repeat(64),
    qualityManifestHash: 'f'.repeat(64),
    lineageManifestHash: '0'.repeat(64),
    evidenceManifestHash: '1'.repeat(64),
    policyHash: '2'.repeat(64),
    qualityState: 'PASS',
    approvalState: 'NOT_REQUIRED',
    createdAt: '2026-08-04T00:00:00.000Z',
  });
  assert.deepEqual(missing, { accepted: false, code: 'DATASET_VERSION_NOT_FOUND' });
  const created = await service.create(context, {
    manifestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    datasetId,
    datasetVersionId: versionId,
    dataMode: 'HYBRID',
    payloadClass: 'GOVERNED_DATA',
    format: 'JSONL',
    rowCount: 2,
    byteSize: 100,
    contentSha256: 'c'.repeat(64),
    schemaVersionId: '77777777-7777-4777-8777-777777777777',
    mappingVersionId: '88888888-8888-4888-8888-888888888888',
    ruleSetVersionId: '99999999-9999-4999-8999-999999999999',
    semanticManifestHash: 'd'.repeat(64),
    metricManifestHash: 'e'.repeat(64),
    qualityManifestHash: 'f'.repeat(64),
    lineageManifestHash: '0'.repeat(64),
    evidenceManifestHash: '1'.repeat(64),
    policyHash: '2'.repeat(64),
    qualityState: 'PASS',
    approvalState: 'NOT_REQUIRED',
    createdAt: '2026-08-04T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
});
