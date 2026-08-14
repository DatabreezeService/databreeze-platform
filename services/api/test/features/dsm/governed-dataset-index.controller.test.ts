import { strict as assert } from 'node:assert';
import test from 'node:test';

import { ForbiddenException } from '@nestjs/common';
import { createGovernedDatasetDefinitionV1 } from '@databreeze/domain/dataset-governance/v1';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryGovernedDatasetRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-governed-dataset-repository.adapter.js';
import type { GovernedDatasetAuthorizationPortV1 } from '../../../src/features/dsm/application/governed-dataset-authorization.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  RequestTenantContextProblemError,
  type RequestTenantContextPortV1,
} from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000801';
const workspaceId = '00000000-0000-4000-8000-000000000802';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000803';
const actorId = '00000000-0000-4000-8000-000000000804';
const correlationId = '00000000-0000-4000-8000-000000000805';

const allowAllAuthorization: GovernedDatasetAuthorizationPortV1 = {
  authorize: () => Promise.resolve({ accepted: true, value: true }),
};

function context(candidateWorkspaceId: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    actorId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: candidateWorkspaceId },
    authorizationEpoch: 1,
    correlationId,
    idempotencyKey,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

async function savePublished(
  repository: InMemoryGovernedDatasetRepositoryAdapter,
  candidateWorkspaceId: string,
  datasetId: string,
  versionId: string,
  name: string,
  publishedAt: string,
  fieldName = 'amount',
  status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
) {
  const result = createGovernedDatasetDefinitionV1({
    datasetId,
    versionId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: candidateWorkspaceId },
    name,
    fields: [
      {
        fieldId: '00000000-0000-4000-8000-000000000831',
        name: fieldName,
        type: 'DECIMAL',
        nullable: true,
      },
      {
        fieldId: '00000000-0000-4000-8000-000000000832',
        name: 'ordered_at',
        type: 'DATE',
        nullable: false,
      },
    ],
    status,
    createdAt: publishedAt,
    ...(status === 'PUBLISHED' ? { publishedAt } : {}),
    canonicalHash: 'a'.repeat(64),
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture definition rejected');
  await repository.save(context(candidateWorkspaceId, `seed-${versionId}`), result.value);
}

async function createApp(
  repository: InMemoryGovernedDatasetRepositoryAdapter,
  requestTenantContext: RequestTenantContextPortV1,
  authorization: GovernedDatasetAuthorizationPortV1 = allowAllAuthorization,
) {
  return createApiApplication({
    governedDatasetRepository: repository,
    governedDatasetAuthorization: authorization,
    requestTenantContext,
  });
}

void test('[DSM-001, DSM-002, DSM-003, DSM-018, DDA-052] index returns only the latest published definition in the request workspace', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  const datasetId = '00000000-0000-4000-8000-000000000811';
  await savePublished(
    repository,
    workspaceId,
    datasetId,
    '00000000-0000-4000-8000-000000000812',
    'Orders',
    '2026-01-01T00:00:00.000Z',
    'restricted_customer_value',
  );
  await savePublished(
    repository,
    workspaceId,
    datasetId,
    '00000000-0000-4000-8000-000000000813',
    'Orders',
    '2026-01-02T00:00:00.000Z',
  );
  await savePublished(
    repository,
    workspaceId,
    datasetId,
    '00000000-0000-4000-8000-000000000816',
    'Orders draft',
    '2026-01-03T00:00:00.000Z',
    'amount',
    'DRAFT',
  );
  await savePublished(
    repository,
    siblingWorkspaceId,
    '00000000-0000-4000-8000-000000000814',
    '00000000-0000-4000-8000-000000000815',
    'Sibling orders',
    '2026-01-03T00:00:00.000Z',
  );

  const tenantContext = context(workspaceId, 'index');
  const { app } = await createApp(repository, { resolve: () => Promise.resolve(tenantContext) });
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/datasets' });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body) as {
      readonly accepted: boolean;
      readonly value: {
        readonly datasets: readonly Record<string, unknown>[];
      };
    };
    assert.equal(body.accepted, true);
    assert.equal(body.value.datasets.length, 1);
    assert.equal(body.value.datasets[0]?.['datasetId'], datasetId);
    assert.equal(body.value.datasets[0]?.['versionId'], '00000000-0000-4000-8000-000000000813');
    assert.equal(body.value.datasets[0]?.['status'], 'PUBLISHED');
    assert.equal(body.value.datasets[0]?.['fieldCount'], 2);
    assert.deepEqual(body.value.datasets[0]?.['fieldTypes'], ['DECIMAL', 'DATE']);
    assert.equal(body.value.datasets[0]?.['readiness'], 'READY');
    assert.equal(body.value.datasets[0]?.['health'], 'UNKNOWN');
    assert.equal(response.body.includes('restricted_customer_value'), false);
    assert.equal(response.body.includes('tenantScope'), false);
    assert.equal(response.body.includes('organizationId'), false);
    assert.equal(response.body.includes('workspaceId'), false);
    assert.equal(response.body.includes('rowCount'), false);
  } finally {
    await app.close();
  }
});

void test('[DSM-021] index uses stable cursor pagination without repeating datasets', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  await savePublished(
    repository,
    workspaceId,
    '00000000-0000-4000-8000-000000000821',
    '00000000-0000-4000-8000-000000000822',
    'Alpha',
    '2026-01-01T00:00:00.000Z',
  );
  await savePublished(
    repository,
    workspaceId,
    '00000000-0000-4000-8000-000000000823',
    '00000000-0000-4000-8000-000000000824',
    'Beta',
    '2026-01-02T00:00:00.000Z',
  );
  await savePublished(
    repository,
    workspaceId,
    '00000000-0000-4000-8000-000000000825',
    '00000000-0000-4000-8000-000000000826',
    'Gamma',
    '2026-01-03T00:00:00.000Z',
  );
  const tenantContext = context(workspaceId, 'pagination');
  const { app } = await createApp(repository, { resolve: () => Promise.resolve(tenantContext) });
  try {
    const first = await app.inject({ method: 'GET', url: '/v1/datasets?limit=2' });
    assert.equal(first.statusCode, 200);
    const firstBody = JSON.parse(first.body) as {
      readonly value: {
        readonly datasets: readonly { readonly datasetId: string }[];
        readonly page: { readonly nextCursor?: string; readonly limit: number };
      };
    };
    assert.equal(firstBody.value.page.limit, 2);
    assert.equal(firstBody.value.datasets.length, 2);
    assert.equal(typeof firstBody.value.page.nextCursor, 'string');

    const second = await app.inject({
      method: 'GET',
      url: `/v1/datasets?limit=2&cursor=${encodeURIComponent(firstBody.value.page.nextCursor ?? '')}`,
    });
    assert.equal(second.statusCode, 200);
    const secondBody = JSON.parse(second.body) as {
      readonly value: {
        readonly datasets: readonly { readonly datasetId: string }[];
        readonly page: { readonly nextCursor?: string };
      };
    };
    assert.deepEqual(
      secondBody.value.datasets.map((dataset) => dataset.datasetId),
      ['00000000-0000-4000-8000-000000000825'],
    );
    assert.equal(secondBody.value.page.nextCursor, undefined);
  } finally {
    await app.close();
  }
});

void test('[DSM-018, DSM-021] hidden index rows are scanned internally and never encoded in public cursors', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  const hiddenDatasetId = '00000000-0000-4000-8000-000000000841';
  const firstVisibleDatasetId = '00000000-0000-4000-8000-000000000842';
  const secondVisibleDatasetId = '00000000-0000-4000-8000-000000000843';
  await savePublished(
    repository,
    workspaceId,
    hiddenDatasetId,
    '00000000-0000-4000-8000-000000000844',
    'Hidden orders',
    '2026-01-01T00:00:00.000Z',
  );
  await savePublished(
    repository,
    workspaceId,
    firstVisibleDatasetId,
    '00000000-0000-4000-8000-000000000845',
    'Visible orders',
    '2026-01-02T00:00:00.000Z',
  );
  await savePublished(
    repository,
    workspaceId,
    secondVisibleDatasetId,
    '00000000-0000-4000-8000-000000000846',
    'Visible customers',
    '2026-01-03T00:00:00.000Z',
  );
  const authorization: GovernedDatasetAuthorizationPortV1 = {
    authorize: (_context, input) =>
      Promise.resolve(
        input.action === 'READ_VERSION' && input.datasetId === hiddenDatasetId
          ? { accepted: false, code: 'DATASET_RESTRICTED' as const }
          : { accepted: true as const, value: true as const },
      ),
  };
  const tenantContext = context(workspaceId, 'hidden-cursor');
  const { app } = await createApp(
    repository,
    { resolve: () => Promise.resolve(tenantContext) },
    authorization,
  );
  try {
    const first = await app.inject({ method: 'GET', url: '/v1/datasets?limit=1' });
    assert.equal(first.statusCode, 200);
    const firstBody = JSON.parse(first.body) as {
      readonly value: {
        readonly datasets: readonly { readonly datasetId: string }[];
        readonly page: { readonly nextCursor?: string };
      };
    };
    assert.deepEqual(
      firstBody.value.datasets.map((dataset) => dataset.datasetId),
      [firstVisibleDatasetId],
    );
    const firstCursor = firstBody.value.page.nextCursor;
    assert.equal(typeof firstCursor, 'string');
    const decodedFirstCursor = Buffer.from(firstCursor ?? '', 'base64url').toString('utf8');
    assert.equal(decodedFirstCursor, firstVisibleDatasetId);
    assert.notEqual(decodedFirstCursor, hiddenDatasetId);

    const second = await app.inject({
      method: 'GET',
      url: `/v1/datasets?limit=1&cursor=${encodeURIComponent(firstCursor ?? '')}`,
    });
    assert.equal(second.statusCode, 200);
    const secondBody = JSON.parse(second.body) as {
      readonly value: {
        readonly datasets: readonly { readonly datasetId: string }[];
        readonly page: { readonly nextCursor?: string };
      };
    };
    assert.deepEqual(
      secondBody.value.datasets.map((dataset) => dataset.datasetId),
      [secondVisibleDatasetId],
    );
    assert.equal(secondBody.value.page.nextCursor, undefined);
  } finally {
    await app.close();
  }
});

void test('[DSM-018, WEB-024] index rejects browser authority hints instead of accepting tenant or membership scope', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  const tenantContext = context(workspaceId, 'authority-fields');
  const { app } = await createApp(repository, { resolve: () => Promise.resolve(tenantContext) });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/datasets?tenantScope=other&actorId=other&membershipId=other&permission=dataset.read',
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.includes('other'), false);
    assert.equal(response.body.includes('dataset.read'), false);
  } finally {
    await app.close();
  }
});

void test('[DSM-018] index fails closed for unauthenticated and forbidden request contexts', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  const unauthenticated = await createApp(repository, {
    resolve: () => Promise.reject(new RequestTenantContextProblemError('AUTHENTICATION_FAILED')),
  });
  try {
    const response = await unauthenticated.app.inject({ method: 'GET', url: '/v1/datasets' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.includes('datasets'), false);
  } finally {
    await unauthenticated.app.close();
  }

  const forbidden = await createApp(repository, {
    resolve: () => Promise.reject(new ForbiddenException()),
  });
  try {
    const response = await forbidden.app.inject({ method: 'GET', url: '/v1/datasets' });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.includes('datasets'), false);
  } finally {
    await forbidden.app.close();
  }
});
