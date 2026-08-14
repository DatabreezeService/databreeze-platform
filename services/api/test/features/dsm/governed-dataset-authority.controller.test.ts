import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createGovernedDatasetDefinitionV1 } from '@databreeze/domain/dataset-governance/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryGovernedDatasetRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-governed-dataset-repository.adapter.js';
import { hasClientAuthorityField } from '../../../src/features/dsm/api/governed-dataset.controller.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000901';
const workspaceId = '00000000-0000-4000-8000-000000000902';
const actorId = '00000000-0000-4000-8000-000000000903';
const correlationId = '00000000-0000-4000-8000-000000000904';
const datasetId = '00000000-0000-4000-8000-000000000905';
const draftVersionId = '00000000-0000-4000-8000-000000000906';
const publishedVersionId = '00000000-0000-4000-8000-000000000907';
const createdDraftVersionId = '00000000-0000-4000-8000-000000000908';
const nextVersionId = '00000000-0000-4000-8000-00000000090c';
const fieldId = '00000000-0000-4000-8000-000000000909';

type DatasetAction = 'READ_INDEX' | 'READ_VERSION' | 'CREATE_DRAFT' | 'PUBLISH' | 'COMPARE';

interface AuthorizationInput {
  readonly action: DatasetAction;
  readonly datasetId?: string;
  readonly versionId?: string;
}

type AuthorizationResult =
  | { readonly accepted: true; readonly value: true }
  | { readonly accepted: false; readonly code: string };

interface TestAuthority {
  readonly calls: AuthorizationInput[];
  authorize(context: unknown, input: AuthorizationInput): Promise<AuthorizationResult>;
}

function context(idempotencyKey: string) {
  const result = createIamTenantContextV1({
    actorId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId,
    idempotencyKey,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid DSM test context');
  return result.value;
}

function stable(identifier: string) {
  const result = parseStableIdentifierV1(identifier);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid DSM test identifier');
  return result.value;
}

function authority(
  decide: (input: AuthorizationInput) => AuthorizationResult = () => ({
    accepted: true,
    value: true,
  }),
): TestAuthority {
  const calls: AuthorizationInput[] = [];
  return {
    calls,
    authorize(_context, input) {
      calls.push(input);
      return Promise.resolve(decide(input));
    },
  };
}

function requestTenantContext(idempotencyKey = 'dsm-http'): RequestTenantContextPortV1 {
  return { resolve: () => Promise.resolve(context(idempotencyKey)) };
}

function applicationOptions(
  repository: InMemoryGovernedDatasetRepositoryAdapter,
  requestContext: RequestTenantContextPortV1,
  testAuthority?: TestAuthority,
): Parameters<typeof createApiApplication>[0] {
  return {
    governedDatasetRepository: repository,
    requestTenantContext: requestContext,
    ...(testAuthority === undefined ? {} : { governedDatasetAuthorization: testAuthority }),
  } as Parameters<typeof createApiApplication>[0];
}

async function createApp(
  repository: InMemoryGovernedDatasetRepositoryAdapter,
  testAuthority?: TestAuthority,
) {
  return createApiApplication(
    applicationOptions(repository, requestTenantContext(), testAuthority),
  );
}

async function seed(
  repository: InMemoryGovernedDatasetRepositoryAdapter,
  candidateVersionId: string,
  status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
): Promise<void> {
  const result = createGovernedDatasetDefinitionV1({
    datasetId,
    versionId: candidateVersionId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    name: 'Orders',
    fields: [
      {
        fieldId,
        name: 'amount',
        type: 'DECIMAL',
        nullable: true,
      },
    ],
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...(status === 'PUBLISHED' ? { publishedAt: '2026-01-01T00:01:00.000Z' } : {}),
    canonicalHash: 'a'.repeat(64),
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid DSM seed');
  await repository.save(context(`seed-${candidateVersionId}`), result.value);
}

void test('[IAM-002, IAM-009, IAM-019, DSM-018] uncomposed DSM authority fails closed before a mutation', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  const { app } = await createApp(repository);
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/datasets',
      payload: {
        datasetId,
        versionId: draftVersionId,
        name: 'Orders',
        fields: [{ fieldId, name: 'amount', type: 'DECIMAL', nullable: true }],
        createdAt: '2026-01-01T00:00:00.000Z',
        canonicalHash: 'a'.repeat(64),
      },
    });
    assert.equal(response.statusCode, 503);
    assert.notEqual(response.statusCode, 200);
    assert.equal((await repository.list(context('verify-empty'), stable(datasetId))).length, 0);
  } finally {
    await app.close();
  }
});

void test('[IAM-002, DSM-018, DDA-052] Viewer can read a currently authorized DatasetVersion', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  await seed(repository, publishedVersionId);
  const testAuthority = authority();
  const { app } = await createApp(repository, testAuthority);
  try {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/datasets/${datasetId}/versions/${publishedVersionId}`,
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /"accepted"\s*:\s*true/);
    assert.deepEqual(testAuthority.calls, [
      { action: 'READ_VERSION', datasetId, versionId: publishedVersionId },
    ]);
  } finally {
    await app.close();
  }
});

void test('[IAM-002, IAM-019, DSM-018] Viewer cannot create or publish a governed dataset', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  await seed(repository, draftVersionId, 'DRAFT');
  const testAuthority = authority((input) =>
    input.action === 'CREATE_DRAFT' || input.action === 'PUBLISH'
      ? { accepted: false, code: 'ACTION_DENIED' }
      : { accepted: true, value: true },
  );
  const { app } = await createApp(repository, testAuthority);
  try {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/datasets',
      payload: {
        datasetId,
        versionId: createdDraftVersionId,
        name: 'Orders',
        fields: [{ fieldId, name: 'amount', type: 'DECIMAL', nullable: true }],
        createdAt: '2026-01-01T00:00:00.000Z',
        canonicalHash: 'b'.repeat(64),
      },
    });
    assert.equal(create.statusCode, 403);
    assert.notEqual(create.statusCode, 200);

    const publish = await app.inject({
      method: 'POST',
      url: `/v1/datasets/${datasetId}/versions/${draftVersionId}/publish`,
      payload: {
        nextVersionId,
        publishedAt: '2026-01-01T00:02:00.000Z',
      },
    });
    assert.equal(publish.statusCode, 403);
    assert.notEqual(publish.statusCode, 200);
    assert.deepEqual(
      testAuthority.calls.map((call) => call.action),
      ['CREATE_DRAFT', 'PUBLISH'],
    );
  } finally {
    await app.close();
  }
});

void test('[IAM-002, IAM-025, DSM-018, DSM-021] Editor and Owner may use the server-approved dataset actions', async () => {
  for (const preset of ['EDITOR', 'OWNER'] as const) {
    const repository = new InMemoryGovernedDatasetRepositoryAdapter();
    await seed(repository, draftVersionId, 'DRAFT');
    const testAuthority = authority((input) =>
      input.action === 'CREATE_DRAFT' || input.action === 'PUBLISH' || input.action === 'COMPARE'
        ? { accepted: true, value: true }
        : { accepted: true, value: true },
    );
    const { app } = await createApiApplication(
      applicationOptions(repository, requestTenantContext(`dsm-${preset}`), testAuthority),
    );
    try {
      const create = await app.inject({
        method: 'POST',
        url: '/v1/datasets',
        payload: {
          datasetId,
          versionId: createdDraftVersionId,
          name: `Orders ${preset}`,
          fields: [{ fieldId, name: 'amount', type: 'DECIMAL', nullable: true }],
          createdAt: '2026-01-01T00:00:00.000Z',
          canonicalHash: 'b'.repeat(64),
        },
      });
      assert.equal(create.statusCode, 201);

      const publish = await app.inject({
        method: 'POST',
        url: `/v1/datasets/${datasetId}/versions/${draftVersionId}/publish`,
        payload: {
          nextVersionId,
          publishedAt: '2026-01-01T00:02:00.000Z',
        },
      });
      assert.equal(publish.statusCode, 200);

      const compare = await app.inject({
        method: 'GET',
        url: `/v1/datasets/${datasetId}/compatibility?previousVersionId=${draftVersionId}&nextVersionId=${nextVersionId}`,
      });
      assert.equal(compare.statusCode, 200);
      assert.deepEqual(
        testAuthority.calls.map((call) => call.action),
        ['CREATE_DRAFT', 'PUBLISH', 'READ_VERSION', 'READ_VERSION', 'COMPARE'],
      );
    } finally {
      await app.close();
    }
  }
});

void test('[IAM-002, IAM-009, DSM-018, DDA-052] restricted datasets are hidden from reads and index results', async () => {
  const restrictedDatasetId = '00000000-0000-4000-8000-00000000090a';
  const restrictedVersionId = '00000000-0000-4000-8000-00000000090b';
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  await seed(repository, publishedVersionId);
  const restricted = createGovernedDatasetDefinitionV1({
    datasetId: restrictedDatasetId,
    versionId: restrictedVersionId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    name: 'Sensitive orders',
    fields: [{ fieldId, name: 'amount', type: 'DECIMAL', nullable: true }],
    status: 'PUBLISHED',
    createdAt: '2026-01-01T00:00:00.000Z',
    publishedAt: '2026-01-01T00:01:00.000Z',
    canonicalHash: 'c'.repeat(64),
  });
  assert.equal(restricted.accepted, true);
  if (!restricted.accepted) throw new Error('invalid restricted seed');
  await repository.save(context('seed-restricted'), restricted.value);
  const testAuthority = authority((input) =>
    input.datasetId === restrictedDatasetId
      ? { accepted: false, code: 'DATASET_RESTRICTED' }
      : { accepted: true, value: true },
  );
  const { app } = await createApp(repository, testAuthority);
  try {
    const hidden = await app.inject({
      method: 'GET',
      url: `/v1/datasets/${restrictedDatasetId}/versions/${restrictedVersionId}`,
    });
    assert.equal(hidden.statusCode, 404);
    assert.notEqual(hidden.statusCode, 200);
    assert.doesNotMatch(hidden.body, /Sensitive orders|restricted/u);

    const index = await app.inject({ method: 'GET', url: '/v1/datasets' });
    assert.equal(index.statusCode, 200);
    assert.equal(index.body.includes(restrictedDatasetId), false);
    assert.equal(index.body.includes('Sensitive orders'), false);
  } finally {
    await app.close();
  }
});

void test('[IAM-002, IAM-008, IAM-019] revoked membership cannot read a dataset', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  await seed(repository, publishedVersionId);
  const testAuthority = authority((input) =>
    input.action === 'READ_VERSION'
      ? { accepted: false, code: 'MEMBERSHIP_REVOKED' }
      : { accepted: false, code: 'MEMBERSHIP_REVOKED' },
  );
  const { app } = await createApp(repository, testAuthority);
  try {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/datasets/${datasetId}/versions/${publishedVersionId}`,
    });
    assert.equal(response.statusCode, 404);
    assert.notEqual(response.statusCode, 200);
  } finally {
    await app.close();
  }
});

void test('[IAM-002, DSM-018] authority outage returns 503 instead of an application error envelope', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  const testAuthority = authority(() => ({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' }));
  const { app } = await createApp(repository, testAuthority);
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/datasets' });
    assert.equal(response.statusCode, 503);
    assert.notEqual(response.statusCode, 200);
    assert.doesNotMatch(response.body, /"accepted"/);
  } finally {
    await app.close();
  }
});

void test('[IAM-002, DSM-018] malformed authority results fail closed as 503', async () => {
  const malformedResults: readonly unknown[] = [
    { accepted: true, value: false },
    { accepted: 'true', value: true },
    { accepted: true, value: true, code: 'ACTION_DENIED' },
    { accepted: false, code: 'NOT_A_KNOWN_CODE' },
  ];
  for (const malformed of malformedResults) {
    const repository = new InMemoryGovernedDatasetRepositoryAdapter();
    const { app } = await createApp(repository, {
      calls: [],
      authorize: () => Promise.resolve(malformed as never),
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/v1/datasets' });
      assert.equal(response.statusCode, 503);
      assert.doesNotMatch(response.body, /NOT_A_KNOWN_CODE|accepted/);
    } finally {
      await app.close();
    }
  }
});

void test('[DSM-018] a read-side action denial is non-enumerating', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  await seed(repository, publishedVersionId);
  const testAuthority = authority((input) =>
    input.action === 'READ_VERSION'
      ? { accepted: false, code: 'ACTION_DENIED' }
      : { accepted: true, value: true },
  );
  const { app } = await createApp(repository, testAuthority);
  try {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/datasets/${datasetId}/versions/${publishedVersionId}`,
    });
    assert.equal(response.statusCode, 404);
    assert.doesNotMatch(response.body, /ACTION_DENIED|Orders/u);
  } finally {
    await app.close();
  }
});

void test('[IAM-003, IAM-017, DSM-018] forged authority fields are rejected without reflecting their values', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  const testAuthority = authority();
  const { app } = await createApp(repository, testAuthority);
  try {
    const query = await app.inject({
      method: 'GET',
      url: '/v1/datasets?membershipId=forged-membership&permission=dataset.create',
    });
    assert.equal(query.statusCode, 400);
    assert.doesNotMatch(query.body, /forged-membership|dataset\.create/u);

    const body = await app.inject({
      method: 'POST',
      url: '/v1/datasets',
      payload: {
        datasetId,
        versionId: draftVersionId,
        name: 'Orders',
        fields: [{ fieldId, name: 'amount', type: 'DECIMAL', nullable: true }],
        createdAt: '2026-01-01T00:00:00.000Z',
        canonicalHash: 'a'.repeat(64),
        actorId: 'forged-actor',
        accessPreset: 'OWNER',
      },
    });
    assert.equal(body.statusCode, 400);
    assert.doesNotMatch(body.body, /forged-actor|OWNER/u);
  } finally {
    await app.close();
  }
});

void test('[DSM-005, DSM-021] invalid identifiers and missing versions are HTTP errors, not 200 rejection envelopes', async () => {
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  const { app } = await createApp(repository, authority());
  try {
    const invalid = await app.inject({
      method: 'GET',
      url: '/v1/datasets/not-a-uuid/versions/not-a-uuid',
    });
    assert.equal(invalid.statusCode, 400);
    assert.notEqual(invalid.statusCode, 200);
    assert.doesNotMatch(invalid.body, /"accepted"/);

    const missing = await app.inject({
      method: 'GET',
      url: `/v1/datasets/${datasetId}/versions/${publishedVersionId}`,
    });
    assert.equal(missing.statusCode, 404);
    assert.notEqual(missing.statusCode, 200);
    assert.doesNotMatch(missing.body, /"accepted"/);
  } finally {
    await app.close();
  }
});

void test('[DSM-018] compare hides restricted resources but still denies visible Viewer comparisons', async () => {
  const restrictedDatasetId = '00000000-0000-4000-8000-00000000090d';
  const restrictedPreviousVersionId = '00000000-0000-4000-8000-00000000090e';
  const restrictedNextVersionId = '00000000-0000-4000-8000-00000000090f';
  const repository = new InMemoryGovernedDatasetRepositoryAdapter();
  for (const [versionId, status] of [
    [restrictedPreviousVersionId, 'DRAFT'],
    [restrictedNextVersionId, 'PUBLISHED'],
  ] as const) {
    const definition = createGovernedDatasetDefinitionV1({
      datasetId: restrictedDatasetId,
      versionId,
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
      name: 'Sensitive orders',
      fields: [{ fieldId, name: 'amount', type: 'DECIMAL', nullable: true }],
      status,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...(status === 'PUBLISHED' ? { publishedAt: '2026-01-01T00:01:00.000Z' } : {}),
      canonicalHash: status === 'DRAFT' ? 'd'.repeat(64) : 'e'.repeat(64),
    });
    assert.equal(definition.accepted, true);
    if (!definition.accepted) throw new Error('invalid restricted compare fixture');
    await repository.save(context(`restricted-compare-${versionId}`), definition.value);
  }

  const restrictedAuthority = authority((input) =>
    input.action === 'READ_VERSION' && input.datasetId === restrictedDatasetId
      ? { accepted: false, code: 'DATASET_RESTRICTED' }
      : input.action === 'COMPARE'
        ? { accepted: false, code: 'ACTION_DENIED' }
        : { accepted: true, value: true },
  );
  const restrictedApp = await createApp(repository, restrictedAuthority);
  try {
    const response = await restrictedApp.app.inject({
      method: 'GET',
      url: `/v1/datasets/${restrictedDatasetId}/compatibility?previousVersionId=${restrictedPreviousVersionId}&nextVersionId=${restrictedNextVersionId}`,
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(
      restrictedAuthority.calls.map((call) => call.action),
      ['READ_VERSION'],
    );
  } finally {
    await restrictedApp.app.close();
  }

  await seed(repository, draftVersionId, 'DRAFT');
  await seed(repository, publishedVersionId, 'PUBLISHED');
  const visibleViewerAuthority = authority((input) =>
    input.action === 'COMPARE'
      ? { accepted: false, code: 'ACTION_DENIED' }
      : { accepted: true, value: true },
  );
  const visibleApp = await createApp(repository, visibleViewerAuthority);
  try {
    const response = await visibleApp.app.inject({
      method: 'GET',
      url: `/v1/datasets/${datasetId}/compatibility?previousVersionId=${draftVersionId}&nextVersionId=${publishedVersionId}`,
    });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(
      visibleViewerAuthority.calls.map((call) => call.action),
      ['READ_VERSION', 'READ_VERSION', 'COMPARE'],
    );
  } finally {
    await visibleApp.app.close();
  }
});

void test('[IAM-003, DSM-018] authority-field scanning is bounded, iterative, cycle-safe, and fail-closed', () => {
  const deep: Record<string, unknown> = {};
  let current = deep;
  for (let index = 0; index < 40; index += 1) {
    const next: Record<string, unknown> = {};
    current['next'] = next;
    current = next;
  }
  assert.equal(hasClientAuthorityField(deep), true);

  const cycle: Record<string, unknown> = {};
  cycle['self'] = cycle;
  assert.equal(hasClientAuthorityField(cycle), true);
  assert.equal(hasClientAuthorityField({ values: new Array(2048).fill(null) }), true);
  assert.equal(
    hasClientAuthorityField(
      Object.fromEntries(Array.from({ length: 10_000 }, (_, index) => [`key${index}`, index])),
    ),
    true,
  );
  assert.equal(hasClientAuthorityField({ nested: { safe: true } }), false);
});
