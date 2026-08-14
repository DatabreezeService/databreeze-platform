import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { AppModule } from '../../../src/app.module.js';
import { DdaModule } from '../../../src/features/dda/dda.module.js';
import { InMemorySourceCatalogRepositoryAdapter } from '../../../src/features/dda/source-catalog/adapter/in-memory-source-catalog-repository.adapter.js';
import { PrismaSourceCatalogRepositoryAdapter } from '../../../src/features/dda/source-catalog/adapter/prisma-source-catalog-repository.adapter.js';
import {
  SOURCE_CATALOG_AUTHORIZATION_PORT,
  type SourceCatalogAuthorizationPortV1,
} from '../../../src/features/dda/source-catalog/application/source-catalog-authorization.port.js';
import {
  SOURCE_CATALOG_SERVICE,
  SourceCatalogService,
} from '../../../src/features/dda/source-catalog/application/source-catalog.service.js';
import {
  ORIGINAL_VIEW_SERVICE,
  OriginalViewService,
} from '../../../src/features/dda/source-catalog/application/original-view.service.js';
import { SOURCE_CATALOG_REPOSITORY_PORT } from '../../../src/features/dda/source-catalog/application/source-catalog-repository.port.js';
import type { SourceCatalogRecordV1 } from '../../../src/features/dda/source-catalog/application/source-catalog-repository.port.js';
import { InMemoryAgentGrantRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-agent-grant-repository.adapter.js';
import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import type { IamMembershipRecordV1 } from '../../../src/features/iam/application/iam-repository.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { IamSourceCatalogAuthorizationAdapter } from '../../../src/features/dda/source-catalog/adapter/iam-source-catalog-authorization.adapter.js';
import type { GovernedDatasetAuthorizationPortV1 } from '../../../src/features/dsm/application/governed-dataset-authorization.port.js';
import type { DdaDatabaseClientV1 } from '../../../src/features/dda/adapter/dda-database.client.js';

const ids = {
  organization: '00000000-0000-4000-8000-00000000e101',
  workspace: '00000000-0000-4000-8000-00000000e102',
  dataset: '00000000-0000-4000-8000-00000000e103',
  source: '00000000-0000-4000-8000-00000000e104',
  artifact: '00000000-0000-4000-8000-00000000e105',
  actor: '00000000-0000-4000-8000-00000000e106',
  correlation: '00000000-0000-4000-8000-00000000e107',
  restrictedDataset: '00000000-0000-4000-8000-00000000e108',
  restrictedSource: '00000000-0000-4000-8000-00000000e109',
  actorB: '00000000-0000-4000-8000-00000000e10a',
  projectA: '00000000-0000-4000-8000-00000000e10b',
  projectB: '00000000-0000-4000-8000-00000000e10c',
  projectActor: '00000000-0000-4000-8000-00000000e10d',
  siblingSource: '00000000-0000-4000-8000-00000000e10e',
  reassignedDataset: '00000000-0000-4000-8000-00000000e10f',
};

function stable(value: string): StableIdentifierV1 {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid root source-catalog fixture');
  return result.value;
}

function context(
  actorId = ids.actor,
  idempotencyKey = 'root-source-catalog-composition',
  tenantScope: TenantScopeV1 = {
    scopeType: 'workspace',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
  },
) {
  const result = createIamTenantContextV1({
    actorId: stable(actorId),
    tenantScope,
    authorizationEpoch: 1,
    correlationId: stable(ids.correlation),
    idempotencyKey,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid root source-catalog context');
  return result.value;
}

function sourceRecord(overrides: Partial<SourceCatalogRecordV1> = {}): SourceCatalogRecordV1 {
  return {
    id: stable(ids.source),
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
    dsmDatasetId: stable(ids.dataset),
    iaeArtifactVersionId: stable(ids.artifact),
    sourceType: 'CSV',
    safeDisplayLabel: 'Safe source label',
    status: 'ACTIVE',
    health: 'HEALTHY',
    versionId: stable(ids.artifact),
    dataMode: 'CLOUD',
    revision: 1,
    updatedAt: '2026-08-13T00:00:00.000Z',
    ...overrides,
  };
}

function membership(
  actorId: string,
  scope: TenantScopeV1 = {
    scopeType: 'workspace',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
  },
): IamMembershipRecordV1 {
  return {
    id: stable(actorId),
    principalId: stable(actorId),
    scope,
    roleId: 'viewer',
    status: 'ACTIVE',
    revision: 1,
  };
}

function providerValue(module: ReturnType<typeof DdaModule.register>, token: unknown): unknown {
  const providers = (module.providers ?? []) as readonly {
    readonly provide?: unknown;
    readonly useValue?: unknown;
  }[];
  return providers.find((provider) => provider.provide === token)?.useValue;
}

function ddaImportValue(
  app: ReturnType<typeof AppModule.register>,
): ReturnType<typeof DdaModule.register> {
  const module = app.imports?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'module' in candidate &&
      candidate.module === DdaModule,
  );
  assert.ok(module);
  return module as ReturnType<typeof DdaModule.register>;
}

void test('[IAM-009][DDA-052] root composes the source catalog authority from the governed dataset authority', () => {
  const governed: GovernedDatasetAuthorizationPortV1 = {
    authorize: () => Promise.resolve({ accepted: true, value: true }),
  };
  const app = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    governedDatasetAuthorization: governed,
  });
  const dda = ddaImportValue(app);
  const sourceAuthorization = providerValue(dda, SOURCE_CATALOG_AUTHORIZATION_PORT);

  assert.ok(sourceAuthorization instanceof IamSourceCatalogAuthorizationAdapter);
  assert.ok(providerValue(dda, SOURCE_CATALOG_SERVICE) instanceof SourceCatalogService);
});

void test('[IAM-009][DDA-052] root-composed IAM restrictions isolate two actors in one workspace', async () => {
  const iam = new InMemoryIamRepositoryAdapter();
  iam.seed([membership(ids.actor), membership(ids.actorB)]);
  const grants = new InMemoryAgentGrantRepositoryAdapter();
  const restrictedAt = parseStrictUtcTimestampV1('2026-08-13T00:00:00.000Z');
  assert.equal(restrictedAt.accepted, true);
  if (!restrictedAt.accepted) throw new Error('invalid root restriction timestamp');
  await grants.saveDatasetRestrictions(
    context(ids.actor, 'root-restriction'),
    {
      memberId: stable(ids.actor),
      deniedDatasetIds: [stable(ids.restrictedDataset)],
      revision: 1,
      updatedAt: restrictedAt.value,
    },
    undefined,
  );
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([
    sourceRecord(),
    {
      ...sourceRecord(),
      id: stable(ids.restrictedSource),
      dsmDatasetId: stable(ids.restrictedDataset),
    },
  ]);
  const app = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    iamRepository: iam,
    agentGrantRepository: grants,
    sourceCatalogRepository: repository,
  });
  const service = providerValue(ddaImportValue(app), SOURCE_CATALOG_SERVICE);
  assert.ok(service instanceof SourceCatalogService);

  assert.deepEqual(
    await service.listDatasetSources(context(ids.actor, 'root-denied'), ids.restrictedDataset),
    { accepted: false, code: 'NOT_FOUND' },
  );
  const allowed = await service.listDatasetSources(
    context(ids.actorB, 'root-allowed'),
    ids.restrictedDataset,
  );
  assert.equal(allowed.accepted, true);
  if (!allowed.accepted) throw new Error('expected allowed root listing');
  assert.deepEqual(
    allowed.value.entries.map((entry) => entry.sourceId),
    [stable(ids.restrictedSource)],
  );
});

void test('[DDA-026][IAM-019] root-composed source repository enforces sibling-project isolation and canonical reassignment', async () => {
  const projectAScope: TenantScopeV1 = {
    scopeType: 'project',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
    projectId: stable(ids.projectA),
  };
  const iam = new InMemoryIamRepositoryAdapter();
  iam.seed([membership(ids.actorB), membership(ids.projectActor, projectAScope)]);
  const grants = new InMemoryAgentGrantRepositoryAdapter();
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([
    sourceRecord(),
    sourceRecord({ id: stable(ids.siblingSource), projectId: stable(ids.projectB) }),
  ]);
  const app = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    iamRepository: iam,
    agentGrantRepository: grants,
    sourceCatalogRepository: repository,
  });
  const service = providerValue(ddaImportValue(app), SOURCE_CATALOG_SERVICE);
  assert.ok(service instanceof SourceCatalogService);

  const projectListing = await service.listDatasetSources(
    context(ids.projectActor, 'root-project-isolation', projectAScope),
    ids.dataset,
  );
  assert.equal(projectListing.accepted, true);
  if (!projectListing.accepted) throw new Error('expected project source listing');
  assert.deepEqual(
    projectListing.value.entries.map((entry) => entry.sourceId),
    [stable(ids.source)],
  );

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
  assert.deepEqual(
    await service.listDatasetSources(context(ids.actorB, 'root-reassignment'), ids.dataset),
    { accepted: false, code: 'NOT_FOUND' },
  );
});

void test('[DDA-052] DdaModule exposes the explicit source authority beside its production repository', () => {
  const authorization: SourceCatalogAuthorizationPortV1 = {
    authorize: () => Promise.resolve({ accepted: true, value: true }),
  };
  const module = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
    sourceCatalogAuthorization: authorization,
  });

  assert.equal(providerValue(module, SOURCE_CATALOG_AUTHORIZATION_PORT), authorization);
  assert.ok(
    providerValue(module, SOURCE_CATALOG_REPOSITORY_PORT) instanceof
      PrismaSourceCatalogRepositoryAdapter,
  );
  assert.ok(providerValue(module, SOURCE_CATALOG_SERVICE) instanceof SourceCatalogService);
});

void test('[IAE-007] production DdaModule leaves original view unavailable until a safe IAE resolver is composed', async () => {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([sourceRecord()]);
  const authorization: SourceCatalogAuthorizationPortV1 = {
    authorize: () => Promise.resolve({ accepted: true, value: true }),
  };
  const module = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
    sourceCatalogRepository: repository,
    sourceCatalogAuthorization: authorization,
  });
  const original = providerValue(module, ORIGINAL_VIEW_SERVICE);
  assert.ok(original instanceof OriginalViewService);

  assert.deepEqual(await original.resolveOriginalView(context(), ids.dataset, ids.source), {
    accepted: false,
    code: 'UNAVAILABLE',
  });
});
