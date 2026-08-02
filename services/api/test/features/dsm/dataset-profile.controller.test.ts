import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryDatasetProfileRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-dataset-profile-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-000000000751',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000752',
    workspaceId: '00000000-0000-4000-8000-000000000753',
  },
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-000000000754',
  idempotencyKey: 'profile-http',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const tenantContext = contextResult.value;

void test('[DSM-011, IAM-009] profile HTTP surface discloses sampling and resource limits without values', async () => {
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    datasetProfileRepository: new InMemoryDatasetProfileRepositoryAdapter(),
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/dataset-profiles',
      payload: {
        profileId: '00000000-0000-4000-8000-000000000755',
        datasetVersionId: '00000000-0000-4000-8000-000000000756',
        completeness: 'DETERMINISTIC_SAMPLE',
        samplingMethod: 'HASHED_ROW_RESERVOIR_V1',
        samplingSeed: 'a'.repeat(64),
        excludedScopes: ['restricted:payroll'],
        rowCountScanned: 50,
        rowCountAvailable: 100,
        resourceLimits: { maxRows: 1000, maxBytes: 1000000, maxDurationMs: 60000 },
        profileFingerprint: 'b'.repeat(64),
        createdAt: '2026-01-01T00:00:00.000Z',
        sourceValue: 'must-not-be-accepted',
      },
    });
    assert.equal(response.statusCode, 400);
    assert.doesNotMatch(response.body, /must-not-be-accepted/u);

    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/dataset-profiles',
      payload: {
        profileId: '00000000-0000-4000-8000-000000000755',
        datasetVersionId: '00000000-0000-4000-8000-000000000756',
        completeness: 'DETERMINISTIC_SAMPLE',
        samplingMethod: 'HASHED_ROW_RESERVOIR_V1',
        samplingSeed: 'a'.repeat(64),
        excludedScopes: ['restricted:payroll'],
        rowCountScanned: 50,
        rowCountAvailable: 100,
        resourceLimits: { maxRows: 1000, maxBytes: 1000000, maxDurationMs: 60000 },
        profileFingerprint: 'b'.repeat(64),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    assert.equal(accepted.statusCode, 201);
    assert.match(accepted.body, /DETERMINISTIC_SAMPLE/u);
    assert.doesNotMatch(accepted.body, /sourceValue|rawValue|path/u);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/dataset-profiles',
      payload: {
        profileId: '00000000-0000-4000-8000-000000000757',
        datasetVersionId: '00000000-0000-4000-8000-000000000756',
        completeness: 'COMPLETE',
        samplingMethod: 'FULL_SCAN_V1',
        rowCountScanned: 100,
        resourceLimits: { maxRows: 1000, maxBytes: 1000000, maxDurationMs: 60000 },
        profileFingerprint: 'c'.repeat(64),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    assert.equal(second.statusCode, 201);

    const firstPage = await app.inject({
      method: 'GET',
      url: '/v1/dataset-profiles/page?datasetVersionId=00000000-0000-4000-8000-000000000756&limit=1',
    });
    assert.equal(firstPage.statusCode, 200);
    const firstPageBody = JSON.parse(firstPage.body) as {
      readonly items: readonly { readonly profileId: string }[];
      readonly nextCursor?: string;
    };
    assert.equal(firstPageBody.items.length, 1);
    assert.equal(typeof firstPageBody.nextCursor, 'string');
    const secondPage = await app.inject({
      method: 'GET',
      url: `/v1/dataset-profiles/page?datasetVersionId=00000000-0000-4000-8000-000000000756&limit=1&cursor=${firstPageBody.nextCursor}`,
    });
    assert.equal(secondPage.statusCode, 200);
    const secondPageBody = JSON.parse(secondPage.body) as {
      readonly items: readonly { readonly profileId: string }[];
    };
    assert.deepEqual(
      secondPageBody.items.map((item) => item.profileId),
      ['00000000-0000-4000-8000-000000000757'],
    );

    const listed = await app.inject({
      method: 'GET',
      url: '/v1/dataset-profiles?datasetVersionId=00000000-0000-4000-8000-000000000756',
    });
    assert.equal(listed.statusCode, 200);
    const body: unknown = JSON.parse(listed.body);
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 2);
  } finally {
    await app.close();
  }
});
