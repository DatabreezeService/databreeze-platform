/* eslint-disable @typescript-eslint/require-await -- authority doubles mirror async adapters. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  type ProjectTenantScopeV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { IamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

import {
  ServerAuthoritativeAnalysisCatalogAdapterV1,
  UnavailableAnalysisCatalogAuthorityAdapterV1,
} from '../../../src/features/dda/analyst/adapter/analysis-catalog.adapter.js';
import { AnalysisCatalogResolverServiceV1 } from '../../../src/features/dda/analyst/application/analysis-catalog-resolver.service.js';
import type {
  AnalysisCatalogAuthorityResultV1,
  AnalysisCatalogAuthoritySnapshotV1,
  AnalysisCatalogRequestV1,
} from '../../../src/features/dda/analyst/application/analysis-catalog.port.js';
import { AnalysisProposalServiceV1 } from '../../../src/features/dda/analyst/application/analysis-proposal.service.js';
import type { AnalysisAdapterPortV1 } from '../../../src/features/dda/analyst/application/analysis-adapter.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000101',
  workspaceA: '00000000-0000-4000-8000-000000000102',
  workspaceB: '00000000-0000-4000-8000-000000000103',
  projectA: '00000000-0000-4000-8000-000000000104',
  projectB: '00000000-0000-4000-8000-000000000105',
  memberA: '00000000-0000-4000-8000-000000000106',
  memberB: '00000000-0000-4000-8000-000000000107',
  datasetA1: '00000000-0000-4000-8000-000000000108',
  datasetA2: '00000000-0000-4000-8000-000000000109',
  datasetB1: '00000000-0000-4000-8000-00000000010a',
  semanticA1: '00000000-0000-4000-8000-00000000010b',
  semanticA2: '00000000-0000-4000-8000-00000000010c',
  semanticB1: '00000000-0000-4000-8000-00000000010d',
  metricA1: '00000000-0000-4000-8000-00000000010e',
  metricA2: '00000000-0000-4000-8000-00000000010f',
  metricB1: '00000000-0000-4000-8000-000000000110',
  permissionA1: '00000000-0000-4000-8000-000000000111',
  permissionA2: '00000000-0000-4000-8000-000000000112',
  permissionB1: '00000000-0000-4000-8000-000000000113',
  correlation: '00000000-0000-4000-8000-000000000114',
});

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error(`invalid test identifier: ${value}`);
  return parsed.value;
}

function scope(workspaceId: string, projectId: string): ProjectTenantScopeV1 {
  return Object.freeze({
    scopeType: 'project',
    organizationId: stable(ids.organization),
    workspaceId: stable(workspaceId),
    projectId: stable(projectId),
  });
}

function contextFor(
  memberId: string,
  tenantScope: ProjectTenantScopeV1,
  key: string,
): Omit<IamTenantContextV1, 'tenantScope'> & { readonly tenantScope: ProjectTenantScopeV1 } {
  const result = createIamTenantContextV1({
    actorId: memberId,
    tenantScope,
    authorizationEpoch: 7,
    correlationId: ids.correlation,
    idempotencyKey: key,
  });
  if (!result.accepted) throw new Error('invalid test context');
  return Object.freeze({ ...result.value, tenantScope });
}

function catalog(
  context: ReturnType<typeof contextFor>,
  overrides: Partial<AnalysisCatalogAuthoritySnapshotV1> = {},
): AnalysisCatalogAuthoritySnapshotV1 {
  return Object.freeze({
    tenantScope: context.tenantScope,
    memberId: context.actorId,
    authorizationEpoch: context.authorizationEpoch,
    versionState: 'CURRENT' as const,
    datasetVersionId: stable(ids.datasetA1),
    semanticVersionId: stable(ids.semanticA1),
    metricVersionId: stable(ids.metricA1),
    permissionProjectionVersionId: stable(ids.permissionA1),
    authorizedFields: Object.freeze(['region', 'amount', 'year']),
    authorizedJoins: Object.freeze([]),
    units: Object.freeze({ amount: 'VND' }),
    grains: Object.freeze(['MONTH']),
    ...overrides,
  });
}

function request(value: AnalysisCatalogAuthoritySnapshotV1): AnalysisCatalogRequestV1 {
  return {
    datasetVersionId: value.datasetVersionId,
    semanticVersionId: value.semanticVersionId,
    metricVersionId: value.metricVersionId,
    permissionProjectionVersionId: value.permissionProjectionVersionId,
  };
}

function proposalInput(value: AnalysisCatalogAuthoritySnapshotV1): Record<string, unknown> {
  return {
    question: 'Doanh so theo vung?',
    ...request(value),
    dimensions: ['region'],
    filters: [],
    timeRange: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
    timeGrain: 'MONTH',
    joins: [],
    units: { amount: 'VND' },
    parameters: {},
    output: { form: 'TABLE', maxRows: 10 },
    assumptions: [],
    estimate: { cpuMs: 1, memoryMb: 1 },
    permissionProjectionVersionId: value.permissionProjectionVersionId,
    manualTypedPlan: true,
  };
}

function availableAdapter(): AnalysisAdapterPortV1 {
  return {
    isAvailable: () => Promise.resolve(false),
    proposeTypedPlan: () => Promise.reject(new Error('AI adapter must not run')),
  };
}

void test('[DDA-015][DDA-016] resolves the current catalog for each request and member', async () => {
  const contextA = contextFor(ids.memberA, scope(ids.workspaceA, ids.projectA), 'catalog-a');
  const contextB = contextFor(ids.memberB, scope(ids.workspaceB, ids.projectB), 'catalog-b');
  const catalogA = catalog(contextA);
  const catalogB = catalog(contextB, {
    tenantScope: contextB.tenantScope,
    memberId: contextB.actorId,
    datasetVersionId: stable(ids.datasetB1),
    semanticVersionId: stable(ids.semanticB1),
    metricVersionId: stable(ids.metricB1),
    permissionProjectionVersionId: stable(ids.permissionB1),
    authorizedFields: Object.freeze(['store']),
    units: Object.freeze({}),
  });
  const calls: string[] = [];
  const adapter = new ServerAuthoritativeAnalysisCatalogAdapterV1({
    load(context) {
      const workspaceId =
        context.tenantScope.scopeType === 'organization'
          ? 'organization'
          : context.tenantScope.workspaceId;
      calls.push(`${context.actorId}:${workspaceId}`);
      return Promise.resolve({
        status: 'AUTHORIZED' as const,
        catalog: context.actorId === contextA.actorId ? catalogA : catalogB,
      });
    },
  });
  const resolver = new AnalysisCatalogResolverServiceV1(adapter);

  const first = await resolver.resolve(contextA, request(catalogA));
  const second = await resolver.resolve(contextB, request(catalogB));

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (first.accepted && second.accepted) {
    assert.equal(first.value.memberId, contextA.actorId);
    assert.equal(first.value.datasetVersionId, catalogA.datasetVersionId);
    assert.equal(second.value.memberId, contextB.actorId);
    assert.equal(second.value.datasetVersionId, catalogB.datasetVersionId);
  }
  assert.deepEqual(calls, [
    `${contextA.actorId}:${contextA.tenantScope.workspaceId}`,
    `${contextB.actorId}:${contextB.tenantScope.workspaceId}`,
  ]);
});

void test('[DDA-017] fails closed when the catalog authority is unavailable', async () => {
  const context = contextFor(ids.memberA, scope(ids.workspaceA, ids.projectA), 'catalog-outage');
  const expected = catalog(context);
  const adapter = new ServerAuthoritativeAnalysisCatalogAdapterV1({
    load() {
      return Promise.reject(new Error('catalog authority unavailable'));
    },
  });
  const resolver = new AnalysisCatalogResolverServiceV1(adapter);

  assert.deepEqual(await resolver.resolve(context, request(expected)), {
    accepted: false,
    code: 'SOURCE_UNAVAILABLE',
  });
  assert.deepEqual(
    await new AnalysisCatalogResolverServiceV1(
      new UnavailableAnalysisCatalogAuthorityAdapterV1(),
    ).resolve(context, request(expected)),
    { accepted: false, code: 'SOURCE_UNAVAILABLE' },
  );
});

void test('[DDA-017] hides restricted dataset and field authority decisions', async () => {
  const context = contextFor(
    ids.memberA,
    scope(ids.workspaceA, ids.projectA),
    'catalog-restricted',
  );
  const expected = catalog(context);
  const adapter = new ServerAuthoritativeAnalysisCatalogAdapterV1({
    load(): Promise<AnalysisCatalogAuthorityResultV1> {
      return Promise.resolve({ status: 'RESTRICTED' });
    },
  });
  const resolver = new AnalysisCatalogResolverServiceV1(adapter);

  assert.deepEqual(await resolver.resolve(context, request(expected)), {
    accepted: false,
    code: 'UNAUTHORIZED_DATA',
  });

  const memberCatalog = catalog(context, {
    authorizedFields: Object.freeze(['region']),
    units: Object.freeze({}),
  });
  const memberAdapter = new ServerAuthoritativeAnalysisCatalogAdapterV1({
    load: () => Promise.resolve({ status: 'AUTHORIZED' as const, catalog: memberCatalog }),
  });
  const service = new AnalysisProposalServiceV1(
    availableAdapter(),
    new AnalysisCatalogResolverServiceV1(memberAdapter),
  );
  const result = await service.propose(context, {
    ...proposalInput(memberCatalog),
    dimensions: ['amount'],
  });
  assert.deepEqual(result, { accepted: false, code: 'UNAUTHORIZED_DATA' });
});

void test('[DDA-017] rejects stale version snapshots and cross-workspace IDs', async () => {
  const context = contextFor(ids.memberA, scope(ids.workspaceA, ids.projectA), 'catalog-stale');
  const expected = catalog(context);
  const staleAdapter = new ServerAuthoritativeAnalysisCatalogAdapterV1({
    load: () =>
      Promise.resolve({
        status: 'AUTHORIZED' as const,
        catalog: catalog(context, { versionState: 'STALE' }),
      }),
  });
  const staleResolver = new AnalysisCatalogResolverServiceV1(staleAdapter);
  assert.deepEqual(await staleResolver.resolve(context, request(expected)), {
    accepted: false,
    code: 'STALE_INPUT',
  });

  const foreignScope = scope(ids.workspaceB, ids.projectB);
  const crossWorkspaceAdapter = new ServerAuthoritativeAnalysisCatalogAdapterV1({
    load: () =>
      Promise.resolve({
        status: 'AUTHORIZED' as const,
        catalog: catalog(context, { tenantScope: foreignScope }),
      }),
  });
  const crossWorkspaceResolver = new AnalysisCatalogResolverServiceV1(crossWorkspaceAdapter);
  assert.deepEqual(await crossWorkspaceResolver.resolve(context, request(expected)), {
    accepted: false,
    code: 'UNAUTHORIZED_DATA',
  });
});

void test('[DDA-015][DDA-016] proposals use the catalog resolved for the current request', async () => {
  const context = contextFor(ids.memberA, scope(ids.workspaceA, ids.projectA), 'catalog-proposal');
  const firstCatalog = catalog(context);
  const secondCatalog = catalog(context, {
    datasetVersionId: stable(ids.datasetA2),
    semanticVersionId: stable(ids.semanticA2),
    metricVersionId: stable(ids.metricA2),
    permissionProjectionVersionId: stable(ids.permissionA2),
  });
  let current = firstCatalog;
  const adapter = new ServerAuthoritativeAnalysisCatalogAdapterV1({
    load: () => Promise.resolve({ status: 'AUTHORIZED' as const, catalog: current }),
  });
  const capturedDatasetVersionIds: string[] = [];
  const proposalAdapter: AnalysisAdapterPortV1 = {
    isAvailable: () => Promise.resolve(true),
    proposeTypedPlan: async (input) => {
      capturedDatasetVersionIds.push(input.catalog.datasetVersionId);
      return { status: 'PROPOSED' as const, planPatch: {} };
    },
  };
  const service = new AnalysisProposalServiceV1(
    proposalAdapter,
    new AnalysisCatalogResolverServiceV1(adapter),
  );

  const first = await service.propose(context, {
    ...proposalInput(firstCatalog),
    manualTypedPlan: false,
  });
  current = secondCatalog;
  const second = await service.propose(context, {
    ...proposalInput(secondCatalog),
    manualTypedPlan: false,
  });

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.deepEqual(capturedDatasetVersionIds, [ids.datasetA1, ids.datasetA2]);
});

void test('[DDA-015] rejects a provider patch that leaves the authorized grain set', async () => {
  const context = contextFor(ids.memberA, scope(ids.workspaceA, ids.projectA), 'catalog-grain');
  const expected = catalog(context);
  const authority = new ServerAuthoritativeAnalysisCatalogAdapterV1({
    load: () => Promise.resolve({ status: 'AUTHORIZED' as const, catalog: expected }),
  });
  const resolver = new AnalysisCatalogResolverServiceV1(authority);
  const service = new AnalysisProposalServiceV1(
    {
      isAvailable: () => Promise.resolve(true),
      proposeTypedPlan: () =>
        Promise.resolve({
          status: 'PROPOSED' as const,
          planPatch: { timeGrain: 'YEAR' },
        }),
    },
    resolver,
  );

  const result = await service.propose(context, {
    ...proposalInput(expected),
    manualTypedPlan: false,
  });

  assert.deepEqual(result, { accepted: false, code: 'UNAUTHORIZED_DATA' });
});
