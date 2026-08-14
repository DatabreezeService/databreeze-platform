/* eslint-disable @typescript-eslint/require-await -- deterministic boundary doubles mirror async adapters. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemorySourceCatalogRepositoryAdapter } from '../../../src/features/dda/source-catalog/adapter/in-memory-source-catalog-repository.adapter.js';
import { PrismaSourceCatalogRepositoryAdapter } from '../../../src/features/dda/source-catalog/adapter/prisma-source-catalog-repository.adapter.js';
import { OriginalViewService } from '../../../src/features/dda/source-catalog/application/original-view.service.js';
import type { SourceCatalogRecordV1 } from '../../../src/features/dda/source-catalog/application/source-catalog-repository.port.js';
import { SourceCatalogService } from '../../../src/features/dda/source-catalog/application/source-catalog.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000c01',
  workspace: '00000000-0000-4000-8000-000000000c02',
  projectA: '00000000-0000-4000-8000-000000000c03',
  projectB: '00000000-0000-4000-8000-000000000c04',
  dataset: '00000000-0000-4000-8000-000000000c05',
  restrictedDataset: '00000000-0000-4000-8000-000000000c06',
  reassignedDataset: '00000000-0000-4000-8000-000000000c15',
  source: '00000000-0000-4000-8000-000000000c07',
  restrictedSource: '00000000-0000-4000-8000-000000000c08',
  projectSourceA: '00000000-0000-4000-8000-000000000c09',
  projectSourceB: '00000000-0000-4000-8000-000000000c0a',
  version: '00000000-0000-4000-8000-000000000c0b',
  iae: '00000000-0000-4000-8000-000000000c0c',
  actorA: '00000000-0000-4000-8000-000000000c0d',
  actorB: '00000000-0000-4000-8000-000000000c0e',
  correlation: '00000000-0000-4000-8000-000000000c0f',
  foreignOrganization: '00000000-0000-4000-8000-000000000c11',
  foreignWorkspace: '00000000-0000-4000-8000-000000000c12',
  foreignDataset: '00000000-0000-4000-8000-000000000c13',
  foreignSource: '00000000-0000-4000-8000-000000000c14',
};

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid source-catalog test identifier');
  return parsed.value;
}

function context(
  scope: TenantScopeV1 = {
    scopeType: 'workspace',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
  },
  actorId = ids.actorA,
  key = 'source-catalog-production-security',
) {
  const result = createIamTenantContextV1({
    tenantScope: scope,
    actorId: stable(actorId),
    correlationId: stable(ids.correlation),
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid source-catalog test context');
  return result.value;
}

function record(
  id: string,
  datasetId = ids.dataset,
  extra: Partial<SourceCatalogRecordV1> = {},
): SourceCatalogRecordV1 {
  return {
    id: stable(id),
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
    dsmDatasetId: stable(datasetId),
    iaeArtifactVersionId: stable(ids.iae),
    sourceType: 'CSV',
    safeDisplayLabel: 'Safe source label',
    status: 'ACTIVE',
    health: 'HEALTHY',
    versionId: stable(ids.version),
    dataMode: 'CLOUD',
    revision: 1,
    updatedAt: '2026-08-12T00:00:00.000Z',
    ...extra,
  };
}

function serviceWithAuthorization(
  repository: unknown,
  authorization: unknown,
): SourceCatalogService {
  return Reflect.construct(SourceCatalogService, [
    repository,
    authorization,
  ]) as SourceCatalogService;
}

function authorization(denied: readonly string[] = [], unavailable = false) {
  return {
    authorize: async (
      currentContext: ReturnType<typeof context>,
      input: { readonly datasetId: StableIdentifierV1 },
    ) => {
      if (unavailable) return { accepted: false as const, code: 'UNAVAILABLE' as const };
      const key = `${currentContext.actorId}:${input.datasetId}`;
      return denied.includes(key)
        ? { accepted: false as const, code: 'NOT_FOUND' as const }
        : { accepted: true as const, value: true as const };
    },
  };
}

function seedInMemory() {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([record(ids.source), record(ids.restrictedSource, ids.restrictedDataset)]);
  return repository;
}

void test('[IAM-009, DSM-018] actor-specific dataset denial prevents listing and original resolution before repository access', async () => {
  let listCalls = 0;
  let findCalls = 0;
  const repository = {
    listByDataset: async () => {
      listCalls += 1;
      return [record(ids.restrictedSource, ids.restrictedDataset)];
    },
    findSource: async () => {
      findCalls += 1;
      return record(ids.restrictedSource, ids.restrictedDataset);
    },
  };
  const deniedKey = `${stable(ids.actorA)}:${stable(ids.restrictedDataset)}`;
  const service = serviceWithAuthorization(repository, authorization([deniedKey]));
  const deniedContext = context(undefined, ids.actorA, 'restricted-actor');
  const allowedContext = context(undefined, ids.actorB, 'unrestricted-actor');

  assert.deepEqual(await service.listDatasetSources(deniedContext, ids.restrictedDataset), {
    accepted: false,
    code: 'NOT_FOUND',
  });
  assert.equal(listCalls, 0);

  const original = new OriginalViewService(service, repository);
  assert.deepEqual(
    await original.resolveOriginalView(deniedContext, ids.restrictedDataset, ids.restrictedSource),
    { accepted: false, code: 'NOT_FOUND' },
  );
  assert.equal(findCalls, 0);

  const listedForOtherActor = await service.listDatasetSources(
    allowedContext,
    ids.restrictedDataset,
  );
  assert.equal(listedForOtherActor.accepted, true);
});

void test('[IAM-009] unavailable source-catalog authorization fails closed without source enumeration', async () => {
  let listCalls = 0;
  const repository = {
    listByDataset: async () => {
      listCalls += 1;
      return [record(ids.source)];
    },
    findSource: async () => record(ids.source),
  };
  const service = serviceWithAuthorization(repository, authorization([], true));

  assert.deepEqual(await service.listDatasetSources(context(), ids.dataset), {
    accepted: false,
    code: 'UNAVAILABLE',
  });
  assert.equal(listCalls, 0);
});

void test('[IAM-009] the unconfigured source-catalog authorization default is unavailable', async () => {
  const repository = seedInMemory();
  const service = new SourceCatalogService(repository);

  assert.deepEqual(await service.listDatasetSources(context(), ids.dataset), {
    accepted: false,
    code: 'UNAVAILABLE',
  });
});

void test('[IAM-009, IAM-019] project context sees its project and workspace rows but never another project', async () => {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([
    record(ids.projectSourceA, ids.dataset, { projectId: stable(ids.projectA) }),
    record(ids.projectSourceB, ids.dataset, { projectId: stable(ids.projectB) }),
    record(ids.source),
  ]);

  const projectContext = context({
    scopeType: 'project',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
    projectId: stable(ids.projectA),
  });
  const visible = await repository.listByDataset(projectContext, stable(ids.dataset));
  assert.deepEqual(
    visible.map((item) => item.id),
    [stable(ids.projectSourceA), stable(ids.source)],
  );
});

void test('[DDA-026, IAM-019] cross-organization sources remain non-enumerable and unopenable', async () => {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([
    {
      ...record(ids.foreignSource, ids.foreignDataset),
      organizationId: stable(ids.foreignOrganization),
      workspaceId: stable(ids.foreignWorkspace),
    },
  ]);
  const service = serviceWithAuthorization(repository, authorization());

  assert.deepEqual(await service.listDatasetSources(context(), ids.foreignDataset), {
    accepted: false,
    code: 'NOT_FOUND',
  });
  const foreignContext = context(
    {
      scopeType: 'workspace',
      organizationId: stable(ids.foreignOrganization),
      workspaceId: stable(ids.foreignWorkspace),
    },
    ids.actorA,
    'foreign-tenant',
  );
  const foreignListing = await service.listDatasetSources(foreignContext, ids.foreignDataset);
  assert.equal(foreignListing.accepted, true);
  assert.deepEqual(
    await new OriginalViewService(service, repository).resolveOriginalView(
      context(),
      ids.foreignDataset,
      ids.foreignSource,
    ),
    { accepted: false, code: 'NOT_FOUND' },
  );
});

void test('[DDA-026] in-memory source resolution also requires an ACTIVE canonical assignment', async () => {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([record(ids.source)]);
  repository.seedAssignments([
    {
      id: stable(ids.source),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      sourceId: stable(ids.source),
      dsmDatasetId: stable(ids.dataset),
      status: 'RETIRED',
    },
  ]);

  assert.deepEqual(await repository.listByDataset(context(), stable(ids.dataset)), []);
  assert.equal(await repository.findSource(context(), stable(ids.source)), undefined);
});

void test('[DDA-026] reassignment with two active rows cannot leave the old dataset canonical', async () => {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([record(ids.source)]);
  repository.seedAssignments([
    {
      id: stable(ids.source),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      sourceId: stable(ids.source),
      dsmDatasetId: stable(ids.dataset),
      status: 'ACTIVE',
    },
    {
      id: stable(ids.reassignedDataset),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      sourceId: stable(ids.source),
      dsmDatasetId: stable(ids.reassignedDataset),
      status: 'ACTIVE',
    },
  ]);

  assert.deepEqual(await repository.listByDataset(context(), stable(ids.dataset)), []);
  assert.equal(await repository.findSource(context(), stable(ids.source)), undefined);
});

function databaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.source,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: null,
    dsmDatasetId: ids.dataset,
    iaeArtifactVersionId: ids.iae,
    sourceType: 'CSV',
    safeDisplayLabel: 'Safe source label',
    status: 'ACTIVE',
    health: 'HEALTHY',
    dataMode: 'CLOUD',
    revision: 1,
    updatedAt: new Date('2026-08-12T00:00:00.000Z'),
    ...overrides,
  };
}

function assignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000c10',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: null,
    sourceId: ids.source,
    dsmDatasetId: ids.dataset,
    status: 'ACTIVE',
    ...overrides,
  };
}

function prismaDb(
  rows: readonly Record<string, unknown>[],
  assignments: readonly Record<string, unknown>[],
) {
  const calls = { list: 0, find: 0, assignment: 0 };
  const db = {
    ddaDatasetSource: {
      findMany: async () => {
        calls.list += 1;
        return rows;
      },
      findFirst: async () => {
        calls.find += 1;
        return rows[0] ?? null;
      },
    },
    ddaSourceAssignment: {
      findMany: async (input: { readonly where: Record<string, unknown> }) => {
        calls.assignment += 1;
        return assignments.filter((assignment) =>
          Object.entries(input.where).every(([key, value]) => assignment[key] === value),
        );
      },
      findFirst: async (input: { readonly where: Record<string, unknown> }) => {
        calls.assignment += 1;
        return (
          assignments.find((assignment) =>
            Object.entries(input.where).every(([key, value]) => assignment[key] === value),
          ) ?? null
        );
      },
    },
  };
  return { db, calls };
}

void test('[DDA-026] Prisma source lookup requires an ACTIVE canonical assignment', async () => {
  const retired = prismaDb([databaseRow()], [assignmentRow({ status: 'RETIRED' })]);
  const adapter = new PrismaSourceCatalogRepositoryAdapter(retired.db as never);

  assert.deepEqual(await adapter.listByDataset(context(), stable(ids.dataset)), []);
  assert.equal(await adapter.findSource(context(), stable(ids.source)), undefined);
  assert.equal(retired.calls.assignment > 0, true);
});

void test('[DDA-026] Prisma source lookup rejects stale old assignment when reassignment is also active', async () => {
  const reassigned = prismaDb(
    [databaseRow()],
    [assignmentRow(), assignmentRow({ dsmDatasetId: ids.reassignedDataset })],
  );
  const adapter = new PrismaSourceCatalogRepositoryAdapter(reassigned.db as never);

  assert.deepEqual(await adapter.listByDataset(context(), stable(ids.dataset)), []);
  assert.equal(await adapter.findSource(context(), stable(ids.source)), undefined);
});

void test('[DDA-026, IAM-019] Prisma source lookup rejects an active reassignment into another project', async () => {
  const reassigned = prismaDb(
    [databaseRow({ projectId: ids.projectA })],
    [assignmentRow({ projectId: ids.projectA }), assignmentRow({ projectId: ids.projectB })],
  );
  const adapter = new PrismaSourceCatalogRepositoryAdapter(reassigned.db as never);
  const projectContext = context({
    scopeType: 'project',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
    projectId: stable(ids.projectA),
  });

  assert.deepEqual(await adapter.listByDataset(projectContext, stable(ids.dataset)), []);
  assert.equal(await adapter.findSource(projectContext, stable(ids.source)), undefined);
});

void test('[IAM-019] Prisma project filtering preserves project ancestry', async () => {
  const rows = [
    databaseRow({ id: ids.projectSourceA, projectId: ids.projectA }),
    databaseRow({ id: ids.projectSourceB, projectId: ids.projectB }),
    databaseRow({ id: ids.source }),
  ];
  const active = prismaDb(rows, [
    assignmentRow({ sourceId: ids.projectSourceA, projectId: ids.projectA }),
    assignmentRow({ sourceId: ids.projectSourceB, projectId: ids.projectB }),
    assignmentRow({ sourceId: ids.source }),
  ]);
  const adapter = new PrismaSourceCatalogRepositoryAdapter(active.db as never);
  const projectContext = context({
    scopeType: 'project',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
    projectId: stable(ids.projectA),
  });

  const visible = await adapter.listByDataset(projectContext, stable(ids.dataset));
  assert.deepEqual(
    visible.map((item) => item.id),
    [stable(ids.projectSourceA), stable(ids.source)],
  );
});

void test('[DDA-052] Prisma rejects unsafe labels and invalid persisted enums', async () => {
  const invalidRows = [
    databaseRow({ safeDisplayLabel: 'C:\\secret.csv' }),
    databaseRow({ safeDisplayLabel: 'folder/file.csv' }),
    databaseRow({ safeDisplayLabel: '..\\secret.csv' }),
    databaseRow({ safeDisplayLabel: ' '.repeat(201) }),
    databaseRow({ safeDisplayLabel: 'unsafe\u0000label' }),
    databaseRow({ sourceType: 'UNSUPPORTED' }),
    databaseRow({ status: 'BROKEN' }),
    databaseRow({ health: 'BROKEN' }),
    databaseRow({ dataMode: 'UNSUPPORTED' }),
    databaseRow({ dataMode: undefined }),
    databaseRow({ previewKind: 'UNSUPPORTED' }),
  ];

  for (const invalid of invalidRows) {
    const db = prismaDb([invalid], [assignmentRow()]);
    const adapter = new PrismaSourceCatalogRepositoryAdapter(db.db as never);
    assert.deepEqual(await adapter.listByDataset(context(), stable(ids.dataset)), []);
  }

  const validLabel = prismaDb(
    [
      databaseRow({
        safeDisplayLabel: 'Revenue / monthly',
        dataMode: 'HYBRID',
        previewKind: 'CSV_SAFE_GRID',
      }),
    ],
    [assignmentRow()],
  );
  const validAdapter = new PrismaSourceCatalogRepositoryAdapter(validLabel.db as never);
  const valid = await validAdapter.listByDataset(context(), stable(ids.dataset));
  assert.equal(valid.length, 1);
  assert.equal(valid[0]?.dataMode, 'HYBRID');
});

void test('[DDA-052] malformed cursors return INVALID_CURSOR before repository access', async () => {
  let listCalls = 0;
  const repository = {
    listByDataset: async () => {
      listCalls += 1;
      return [record(ids.source)];
    },
    findSource: async () => record(ids.source),
  };
  const service = serviceWithAuthorization(repository, authorization());

  for (const cursor of [
    'not-base64',
    Buffer.from(`2026-08-12T00:00:00.000Z|${ids.source.toUpperCase()}`, 'utf8').toString(
      'base64url',
    ),
  ]) {
    assert.deepEqual(await service.listDatasetSources(context(), ids.dataset, cursor), {
      accepted: false,
      code: 'INVALID_CURSOR',
    });
  }
  assert.equal(listCalls, 0);
});

void test('[DDA-052] invalid runtime limits return INVALID_LIMIT and never reach the repository', async () => {
  let listCalls = 0;
  const repository = {
    listByDataset: async () => {
      listCalls += 1;
      return [record(ids.source)];
    },
    findSource: async () => record(ids.source),
  };
  const service = serviceWithAuthorization(repository, authorization());

  for (const limit of ['50', Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5, 51, [], {}]) {
    assert.deepEqual(
      await service.listDatasetSources(context(), ids.dataset, undefined, limit as never),
      {
        accepted: false,
        code: 'INVALID_LIMIT',
      },
    );
  }
  assert.equal(listCalls, 0);
});

void test('[DDA-052] valid cursor shape must identify an existing page boundary', async () => {
  const repository = seedInMemory();
  const service = serviceWithAuthorization(repository, authorization());
  const valid = await service.listDatasetSources(context(), ids.dataset, undefined, 1);
  assert.equal(valid.accepted, true);
  if (!valid.accepted || valid.value.page.nextCursor === undefined) return;

  const unknownCursor = Buffer.from(
    `2026-08-12T00:00:00.000Z|${ids.restrictedSource}`,
    'utf8',
  ).toString('base64url');
  assert.deepEqual(await service.listDatasetSources(context(), ids.dataset, unknownCursor, 1), {
    accepted: false,
    code: 'NOT_FOUND',
  });
});

void test('[IAE-007] production original view requires an injected resolver', async () => {
  const repository = seedInMemory();
  const catalog = serviceWithAuthorization(repository, authorization());
  const service = new OriginalViewService(catalog, repository);

  assert.deepEqual(await service.resolveOriginalView(context(), ids.dataset, ids.source), {
    accepted: false,
    code: 'UNAVAILABLE',
  });
});

void test('[IAE-007] injected resolver receives the exact tenant/source/version/artifact authority tuple', async () => {
  const repository = seedInMemory();
  const catalog = serviceWithAuthorization(repository, authorization());
  const calls: unknown[] = [];
  const resolver = {
    resolveOriginalView: async (input: unknown) => {
      calls.push(input);
      return {
        accepted: true as const,
        value: {
          kind: 'PDF' as const,
          iaeContentReferenceId: stable(ids.iae),
        },
      };
    },
  };
  const service = Reflect.construct(OriginalViewService, [
    catalog,
    repository,
    resolver,
  ]) as OriginalViewService;

  const view = await service.resolveOriginalView(context(), ids.dataset, ids.source);
  assert.equal(view.accepted, true);
  assert.deepEqual(calls, [
    {
      context: context(),
      datasetId: stable(ids.dataset),
      sourceId: stable(ids.source),
      sourceVersionId: stable(ids.version),
      iaeArtifactVersionId: stable(ids.iae),
      sourceType: 'CSV',
      dataMode: 'CLOUD',
    },
  ]);
});

void test('[DDA-052, IAE-007] malformed resolver descriptors fail closed without path leakage', async () => {
  const repository = seedInMemory();
  const catalog = serviceWithAuthorization(repository, authorization());
  const resolver = {
    resolveOriginalView: async () => ({
      accepted: true as const,
      value: {
        kind: 'PDF' as const,
        iaeContentReferenceId: stable(ids.iae),
        path: 'C:\\secret\\source.pdf',
      },
    }),
  };
  const service = Reflect.construct(OriginalViewService, [
    catalog,
    repository,
    resolver,
  ]) as OriginalViewService;

  assert.deepEqual(await service.resolveOriginalView(context(), ids.dataset, ids.source), {
    accepted: false,
    code: 'UNAVAILABLE',
  });
});

void test('[DDA-052, IAE-007] cloud sources cannot be switched to a local device action by the resolver', async () => {
  const repository = seedInMemory();
  const catalog = serviceWithAuthorization(repository, authorization());
  const resolver = {
    resolveOriginalView: async () => ({
      accepted: true as const,
      value: { kind: 'OPEN_ON_SOURCE_DEVICE' as const },
    }),
  };
  const service = Reflect.construct(OriginalViewService, [
    catalog,
    repository,
    resolver,
  ]) as OriginalViewService;

  assert.deepEqual(await service.resolveOriginalView(context(), ids.dataset, ids.source), {
    accepted: false,
    code: 'UNAVAILABLE',
  });
});
