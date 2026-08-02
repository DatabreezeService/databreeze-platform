import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryDatasetQualityRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-quality-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000921';
const workspaceId = '00000000-0000-4000-8000-000000000922';
const resultId = '00000000-0000-4000-8000-000000000923';
const datasetVersionId = '00000000-0000-4000-8000-000000000924';

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000925',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000926',
    idempotencyKey: 'quality-controller',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

void test('[DSM-011, DSM-013, DSM-015] quality HTTP surfaces never accept source values', async () => {
  const tenantContext = context();
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    datasetQualityRepository: new InMemoryDatasetQualityRepositoryAdapter(),
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/dataset-quality-results',
      payload: {
        resultId,
        datasetId: '00000000-0000-4000-8000-000000000927',
        datasetVersionId,
        ruleSetVersionId: '00000000-0000-4000-8000-000000000928',
        profileFingerprint: 'a'.repeat(64),
        rowCountScanned: 42,
        qualityState: 'PASS_WITH_WARNINGS',
        findings: [
          {
            findingId: '00000000-0000-4000-8000-000000000929',
            ruleId: '00000000-0000-4000-8000-000000000930',
            severity: 'WARNING',
            messageCode: 'NULL_RATE_HIGH',
            occurrenceCount: 3,
            evidenceIds: [],
            detailHash: 'b'.repeat(64),
          },
        ],
        resultFingerprint: 'c'.repeat(64),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.includes('sourceValue'), false);
    const read = await app.inject({
      method: 'GET',
      url: `/v1/dataset-quality-results/${resultId}`,
    });
    assert.equal(read.statusCode, 200);
    const listed = await app.inject({
      method: 'GET',
      url: `/v1/dataset-quality-results?datasetVersionId=${datasetVersionId}`,
    });
    assert.equal(listed.statusCode, 200);
    const listedBody: unknown = JSON.parse(listed.body);
    assert.ok(Array.isArray(listedBody));
    assert.equal(listedBody.length, 1);
  } finally {
    await app.close();
  }
});

void test('[DSM-013] quality DTO rejects unsupported source-bearing fields and malformed fingerprints', async () => {
  const { app } = await createApiApplication({
    datasetQualityRepository: new InMemoryDatasetQualityRepositoryAdapter(),
    requestTenantContext: { resolve: () => Promise.resolve(context()) },
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/dataset-quality-results',
      payload: {
        resultId,
        datasetId: '00000000-0000-4000-8000-000000000927',
        datasetVersionId,
        ruleSetVersionId: '00000000-0000-4000-8000-000000000928',
        profileFingerprint: 'not-a-hash',
        rowCountScanned: 0,
        qualityState: 'PASS',
        findings: [],
        resultFingerprint: 'c'.repeat(64),
        createdAt: '2026-01-01T00:00:00.000Z',
        sourceValue: 'must-not-be-accepted',
      },
    });
    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});
