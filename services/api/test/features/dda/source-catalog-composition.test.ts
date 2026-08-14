import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryAgentGrantRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-agent-grant-repository.adapter.js';
import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { AccessPresetService } from '../../../src/features/iam/application/access-preset.service.js';
import type { IamMembershipRecordV1 } from '../../../src/features/iam/application/iam-repository.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { IamGovernedDatasetAuthorizationAdapter } from '../../../src/features/dsm/adapter/iam-governed-dataset-authorization.adapter.js';
import type { SourceCatalogAuthorizationPortV1 } from '../../../src/features/dda/source-catalog/application/source-catalog-authorization.port.js';
import { IamSourceCatalogAuthorizationAdapter } from '../../../src/features/dda/source-catalog/adapter/iam-source-catalog-authorization.adapter.js';
import { InMemorySourceCatalogRepositoryAdapter } from '../../../src/features/dda/source-catalog/adapter/in-memory-source-catalog-repository.adapter.js';
import { OriginalViewService } from '../../../src/features/dda/source-catalog/application/original-view.service.js';
import type { SourceCatalogRecordV1 } from '../../../src/features/dda/source-catalog/application/source-catalog-repository.port.js';
import { SourceCatalogService } from '../../../src/features/dda/source-catalog/application/source-catalog.service.js';
import type { GovernedDatasetAuthorizationPortV1 } from '../../../src/features/dsm/application/governed-dataset-authorization.port.js';

const ids = {
  organization: '00000000-0000-4000-8000-00000000d101',
  workspace: '00000000-0000-4000-8000-00000000d102',
  projectA: '00000000-0000-4000-8000-00000000d103',
  projectB: '00000000-0000-4000-8000-00000000d104',
  dataset: '00000000-0000-4000-8000-00000000d105',
  restrictedDataset: '00000000-0000-4000-8000-00000000d106',
  reassignedDataset: '00000000-0000-4000-8000-00000000d107',
  source: '00000000-0000-4000-8000-00000000d108',
  restrictedSource: '00000000-0000-4000-8000-00000000d109',
  siblingSource: '00000000-0000-4000-8000-00000000d10a',
  version: '00000000-0000-4000-8000-00000000d10b',
  artifact: '00000000-0000-4000-8000-00000000d10c',
  actorA: '00000000-0000-4000-8000-00000000d10d',
  actorB: '00000000-0000-4000-8000-00000000d10e',
  membershipA: '00000000-0000-4000-8000-00000000d10f',
  membershipB: '00000000-0000-4000-8000-00000000d110',
  projectMembershipA: '00000000-0000-4000-8000-00000000d111',
  correlation: '00000000-0000-4000-8000-00000000d112',
};

function stable(value: string): StableIdentifierV1 {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid source-catalog composition fixture');
  return result.value;
}

function context(
  actorId: string,
  idempotencyKey: string,
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
  if (!result.accepted) throw new Error('invalid source-catalog composition context');
  return result.value;
}

function membership(id: string, principalId: string, scope: TenantScopeV1): IamMembershipRecordV1 {
  return {
    id: stable(id),
    principalId: stable(principalId),
    scope,
    roleId: 'viewer',
    status: 'ACTIVE',
    revision: 1,
  };
}

function record(
  id: string,
  datasetId: string,
  extra: Partial<SourceCatalogRecordV1> = {},
): SourceCatalogRecordV1 {
  return {
    id: stable(id),
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
    dsmDatasetId: stable(datasetId),
    iaeArtifactVersionId: stable(ids.artifact),
    sourceType: 'CSV',
    safeDisplayLabel: 'Safe source label',
    status: 'ACTIVE',
    health: 'HEALTHY',
    versionId: stable(ids.version),
    dataMode: 'CLOUD',
    revision: 1,
    updatedAt: '2026-08-13T00:00:00.000Z',
    ...extra,
  };
}

void test('[IAM-009][DDA-052] IAM-backed source authority preserves exact dataset and action and maps restriction safely', async () => {
  const calls: unknown[] = [];
  const governed: GovernedDatasetAuthorizationPortV1 = {
    authorize: (_context, input) => {
      calls.push(input);
      return Promise.resolve({ accepted: false, code: 'DATASET_RESTRICTED' as const });
    },
  };
  const adapter = new IamSourceCatalogAuthorizationAdapter(governed);
  const currentContext = context(ids.actorA, 'exact-dataset');

  assert.deepEqual(
    await adapter.authorize(currentContext, {
      action: 'READ_VERSION',
      datasetId: stable(ids.restrictedDataset),
      sourceId: stable(ids.restrictedSource),
      versionId: stable(ids.version),
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
  assert.deepEqual(calls, [
    {
      action: 'READ_VERSION',
      datasetId: stable(ids.restrictedDataset),
      versionId: stable(ids.version),
    },
  ]);

  assert.deepEqual(
    await adapter.authorize(currentContext, {
      action: 'READ_INDEX',
      datasetId: stable(ids.dataset),
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );

  assert.deepEqual(
    await adapter.authorize(currentContext, {
      action: 'READ_INDEX',
      datasetId: ids.dataset.toUpperCase() as never,
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
  assert.deepEqual(
    await adapter.authorize(currentContext, {
      action: 'READ_INDEX',
      datasetId: stable(ids.dataset),
      actorId: ids.actorA,
    } as never),
    { accepted: false, code: 'NOT_FOUND' },
  );

  const unavailable = new IamSourceCatalogAuthorizationAdapter({
    authorize: () => Promise.reject(new Error('IAM_DOWN')),
  });
  assert.deepEqual(
    await unavailable.authorize(currentContext, {
      action: 'READ_INDEX',
      datasetId: stable(ids.dataset),
    }),
    { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' },
  );
});

void test('[IAM-009][IAM-019][DDA-026] production source composition isolates restricted actors, sibling projects, and reassigned sources', async () => {
  const iam = new InMemoryIamRepositoryAdapter();
  const workspaceScope: TenantScopeV1 = {
    scopeType: 'workspace',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
  };
  const projectAScope: TenantScopeV1 = {
    scopeType: 'project',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
    projectId: stable(ids.projectA),
  };
  iam.seed([
    membership(ids.membershipA, ids.actorA, workspaceScope),
    membership(ids.membershipB, ids.actorB, workspaceScope),
    membership(ids.projectMembershipA, ids.actorA, projectAScope),
  ]);
  const grants = new InMemoryAgentGrantRepositoryAdapter();
  const restrictedAt = parseStrictUtcTimestampV1('2026-08-13T00:00:00.000Z');
  assert.equal(restrictedAt.accepted, true);
  if (!restrictedAt.accepted) throw new Error('invalid restriction timestamp');
  await grants.saveDatasetRestrictions(
    context(ids.actorA, 'restrict-dataset'),
    {
      memberId: stable(ids.membershipA),
      deniedDatasetIds: [stable(ids.restrictedDataset)],
      revision: 1,
      updatedAt: restrictedAt.value,
    },
    undefined,
  );
  const governed = new IamGovernedDatasetAuthorizationAdapter(
    iam,
    new AccessPresetService(),
    grants,
  );
  const sourceAuthorization = new IamSourceCatalogAuthorizationAdapter(governed);
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([
    record(ids.source, ids.dataset),
    record(ids.restrictedSource, ids.restrictedDataset),
    record(ids.siblingSource, ids.dataset, { projectId: stable(ids.projectB) }),
  ]);
  const service = new SourceCatalogService(repository, sourceAuthorization);

  assert.deepEqual(
    await service.listDatasetSources(context(ids.actorA, 'restricted'), ids.restrictedDataset),
    {
      accepted: false,
      code: 'NOT_FOUND',
    },
  );
  assert.deepEqual(
    await new OriginalViewService(service, repository).resolveOriginalView(
      context(ids.actorA, 'restricted-original'),
      ids.restrictedDataset,
      ids.restrictedSource,
    ),
    { accepted: false, code: 'NOT_FOUND' },
  );
  const actorBListing = await service.listDatasetSources(
    context(ids.actorB, 'allowed'),
    ids.restrictedDataset,
  );
  assert.equal(actorBListing.accepted, true);
  if (!actorBListing.accepted) throw new Error('expected unrestricted actor listing');
  assert.deepEqual(
    actorBListing.value.entries.map((entry) => entry.sourceId),
    [stable(ids.restrictedSource)],
  );

  const siblingContext = context(ids.actorA, 'sibling-project', projectAScope);
  const siblingListing = await service.listDatasetSources(siblingContext, ids.dataset);
  assert.equal(siblingListing.accepted, true);
  if (!siblingListing.accepted) throw new Error('expected project listing');
  assert.deepEqual(
    siblingListing.value.entries.map((entry) => entry.sourceId),
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
  const reassignedListing = await service.listDatasetSources(
    context(ids.actorB, 'reassigned'),
    ids.dataset,
  );
  assert.deepEqual(reassignedListing, { accepted: false, code: 'NOT_FOUND' });
});

void test('[IAE-007] root production composition leaves original view unavailable without a safe IAE signed-view descriptor port', async () => {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([record(ids.source, ids.dataset)]);
  const sourceAuthorization: SourceCatalogAuthorizationPortV1 = {
    authorize: () => Promise.resolve({ accepted: true, value: true }),
  };
  const catalog = new SourceCatalogService(repository, sourceAuthorization);
  const original = new OriginalViewService(catalog, repository);

  assert.deepEqual(
    await original.resolveOriginalView(
      context(ids.actorB, 'resolver-unavailable'),
      ids.dataset,
      ids.source,
    ),
    { accepted: false, code: 'UNAVAILABLE' },
  );
});
