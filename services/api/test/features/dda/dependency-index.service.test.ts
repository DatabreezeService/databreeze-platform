import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryDependencyRepositoryAdapter } from '../../../src/features/dda/refresh/adapter/in-memory-dependency-repository.adapter.js';
import { DependencyIndexService } from '../../../src/features/dda/refresh/application/dependency-index.service.js';
import type { ContentSafeBoundInputEventV1 } from '../../../src/features/dda/refresh/application/dependency-repository.port.js';
import { MaterializationProcessorCatalog } from '../../../src/features/dda/refresh/application/materialization-processor-catalog.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

const foreignScopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000091',
  workspaceId: '00000000-0000-4000-8000-000000000092',
  projectId: '00000000-0000-4000-8000-000000000093',
});
assert.equal(foreignScopeResult.accepted, true);
const foreignScope = foreignScopeResult.accepted ? foreignScopeResult.value : (null as never);

const ids = {
  dashboardId: '00000000-0000-4000-8000-000000000101',
  dashboardVersionId: '00000000-0000-4000-8000-000000000102',
  widgetA: '00000000-0000-4000-8000-000000000103',
  widgetB: '00000000-0000-4000-8000-000000000104',
  planA: '00000000-0000-4000-8000-000000000105',
  planB: '00000000-0000-4000-8000-000000000106',
  datasetV1: '00000000-0000-4000-8000-000000000107',
  datasetV2: '00000000-0000-4000-8000-000000000108',
  semanticV1: '00000000-0000-4000-8000-000000000109',
  metricV1: '00000000-0000-4000-8000-00000000010a',
  metricV2: '00000000-0000-4000-8000-00000000010b',
  defA: '00000000-0000-4000-8000-00000000010c',
  defB: '00000000-0000-4000-8000-00000000010d',
  defDeleted: '00000000-0000-4000-8000-00000000010e',
  permission: '00000000-0000-4000-8000-00000000010f',
  policy: '00000000-0000-4000-8000-000000000110',
};

function seedRepository(): InMemoryDependencyRepositoryAdapter {
  const repository = new InMemoryDependencyRepositoryAdapter();
  repository.seedBindings([
    {
      materializationDefinitionId: ids.defA,
      tenantScope: scope,
      dashboardId: ids.dashboardId,
      dashboardVersionId: ids.dashboardVersionId,
      widgetId: ids.widgetA,
      analysisPlanVersionId: ids.planA,
      datasetVersionId: ids.datasetV1,
      semanticVersionId: ids.semanticV1,
      metricVersionId: ids.metricV1,
      permissionProjectionVersionId: ids.permission,
      parameterHash: 'c'.repeat(64),
      locale: 'vi',
      timezone: 'Asia/Ho_Chi_Minh',
      engineVersion: 'engine-1.0.0',
      adapterVersion: 'adapter-1.0.0',
      effectivePolicyVersionId: ids.policy,
      processorId: 'dda_materialize_query',
      deleted: false,
    },
    {
      materializationDefinitionId: ids.defB,
      tenantScope: scope,
      dashboardId: ids.dashboardId,
      dashboardVersionId: ids.dashboardVersionId,
      widgetId: ids.widgetB,
      analysisPlanVersionId: ids.planB,
      datasetVersionId: ids.datasetV1,
      semanticVersionId: ids.semanticV1,
      metricVersionId: ids.metricV2,
      permissionProjectionVersionId: ids.permission,
      parameterHash: 'd'.repeat(64),
      locale: 'vi',
      timezone: 'Asia/Ho_Chi_Minh',
      engineVersion: 'engine-1.0.0',
      adapterVersion: 'adapter-1.0.0',
      effectivePolicyVersionId: ids.policy,
      processorId: 'dda_materialize_query',
      deleted: false,
    },
    {
      materializationDefinitionId: ids.defDeleted,
      tenantScope: scope,
      dashboardId: ids.dashboardId,
      dashboardVersionId: ids.dashboardVersionId,
      widgetId: ids.widgetA,
      analysisPlanVersionId: ids.planA,
      datasetVersionId: ids.datasetV2,
      semanticVersionId: ids.semanticV1,
      metricVersionId: ids.metricV1,
      permissionProjectionVersionId: ids.permission,
      parameterHash: 'e'.repeat(64),
      locale: 'vi',
      timezone: 'Asia/Ho_Chi_Minh',
      engineVersion: 'engine-1.0.0',
      adapterVersion: 'adapter-1.0.0',
      effectivePolicyVersionId: ids.policy,
      processorId: 'dda_materialize_query',
      deleted: true,
    },
  ]);
  return repository;
}

function event(
  overrides: Partial<ContentSafeBoundInputEventV1> &
    Pick<ContentSafeBoundInputEventV1, 'eventId' | 'changeKind' | 'referenceId' | 'sequence'>,
): ContentSafeBoundInputEventV1 {
  return {
    tenantScope: scope,
    occurredAt: '2026-08-10T10:00:00.000Z',
    authorized: true,
    ...overrides,
  };
}

void test('[DDA-028] dataset/semantic/metric/parameter changes select affected materialization definitions', async () => {
  const service = new DependencyIndexService(
    seedRepository(),
    new MaterializationProcessorCatalog(),
  );
  const dataset = await service.resolveAffected(
    event({
      eventId: '00000000-0000-4000-8000-000000000201',
      changeKind: 'DATASET_VERSION',
      referenceId: ids.datasetV1,
      sequence: 1,
    }),
  );
  assert.equal(dataset.accepted, true);
  if (!dataset.accepted) return;
  assert.deepEqual([...dataset.value.affectedDefinitionIds].sort(), [ids.defA, ids.defB].sort());

  const metric = await service.resolveAffected(
    event({
      eventId: '00000000-0000-4000-8000-000000000202',
      changeKind: 'METRIC_VERSION',
      referenceId: ids.metricV2,
      sequence: 2,
    }),
  );
  assert.equal(metric.accepted, true);
  if (!metric.accepted) return;
  assert.deepEqual(metric.value.affectedDefinitionIds, [ids.defB]);

  const parameter = await service.resolveAffected(
    event({
      eventId: '00000000-0000-4000-8000-000000000203',
      changeKind: 'PARAMETER',
      referenceId: ids.defA,
      sequence: 3,
    }),
  );
  assert.equal(parameter.accepted, true);
  if (!parameter.accepted) return;
  assert.deepEqual(parameter.value.affectedDefinitionIds, [ids.defA]);
});

void test('[DDA-028] deleted bindings and unauthorized/cross-tenant references are ignored', async () => {
  const service = new DependencyIndexService(
    seedRepository(),
    new MaterializationProcessorCatalog(),
  );
  const deleted = await service.resolveAffected(
    event({
      eventId: '00000000-0000-4000-8000-000000000204',
      changeKind: 'DATASET_VERSION',
      referenceId: ids.datasetV2,
      sequence: 1,
    }),
  );
  assert.equal(deleted.accepted, true);
  if (!deleted.accepted) return;
  assert.deepEqual(deleted.value.affectedDefinitionIds, []);

  const unauthorized = await service.resolveAffected(
    event({
      eventId: '00000000-0000-4000-8000-000000000205',
      changeKind: 'DATASET_VERSION',
      referenceId: ids.datasetV1,
      sequence: 2,
      authorized: false,
    }),
  );
  assert.equal(unauthorized.accepted, false);
  if (unauthorized.accepted) return;
  assert.equal(unauthorized.code, 'UNAUTHORIZED_EVENT_REFERENCE');

  const crossTenant = await service.resolveAffected(
    event({
      eventId: '00000000-0000-4000-8000-000000000206',
      changeKind: 'DATASET_VERSION',
      referenceId: ids.datasetV1,
      sequence: 3,
      tenantScope: foreignScope,
    }),
  );
  assert.equal(crossTenant.accepted, false);
  if (crossTenant.accepted) return;
  assert.equal(crossTenant.code, 'CROSS_TENANT_EVENT_REFERENCE');
});

void test('[DDA-028] duplicate and out-of-order events are idempotent and ignore payload values', async () => {
  const repository = seedRepository();
  const service = new DependencyIndexService(repository, new MaterializationProcessorCatalog());
  const first = await service.resolveAffected({
    ...event({
      eventId: '00000000-0000-4000-8000-000000000207',
      changeKind: 'DATASET_VERSION',
      referenceId: ids.datasetV1,
      sequence: 5,
    }),
    ...({ payloadValues: { secret: 'should-never-authorize' } } as object),
  } as ContentSafeBoundInputEventV1);
  const duplicate = await service.resolveAffected(
    event({
      eventId: '00000000-0000-4000-8000-000000000207',
      changeKind: 'DATASET_VERSION',
      referenceId: ids.datasetV1,
      sequence: 5,
    }),
  );
  const outOfOrder = await service.resolveAffected(
    event({
      eventId: '00000000-0000-4000-8000-000000000208',
      changeKind: 'DATASET_VERSION',
      referenceId: ids.datasetV1,
      sequence: 1,
    }),
  );
  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, true);
  assert.equal(outOfOrder.accepted, true);
  if (!first.accepted || !duplicate.accepted || !outOfOrder.accepted) return;
  assert.deepEqual(duplicate.value.affectedDefinitionIds, first.value.affectedDefinitionIds);
  assert.equal(duplicate.value.ignoredReason, 'DUPLICATE_EVENT');
  assert.equal(outOfOrder.value.ignoredReason, 'OUT_OF_ORDER_EVENT');
  assert.deepEqual(outOfOrder.value.affectedDefinitionIds, []);
  assert.equal(repository.observedPayloadKeys().includes('payloadValues'), false);
});

void test('[DDA-031] incremental recompute requires registered compatible semantics and prior-state proof', () => {
  const catalog = new MaterializationProcessorCatalog();
  catalog.register({
    processorId: 'dda_materialize_query',
    compatibleChangeKinds: ['APPEND_ROWS'],
    requiresPriorStateProof: true,
  });

  const incremental = catalog.decideRecompute({
    processorId: 'dda_materialize_query',
    changeKind: 'APPEND_ROWS',
    priorStateProof: { cacheIdentityHash: 'f'.repeat(64), verified: true },
  });
  assert.equal(incremental.mode, 'INCREMENTAL');
  assert.equal(incremental.reason, 'COMPATIBLE_CHANGE_WITH_PRIOR_STATE');

  const missingProof = catalog.decideRecompute({
    processorId: 'dda_materialize_query',
    changeKind: 'APPEND_ROWS',
    priorStateProof: { cacheIdentityHash: 'f'.repeat(64), verified: false },
  });
  assert.equal(missingProof.mode, 'FULL');
  assert.equal(missingProof.reason, 'PRIOR_STATE_UNVERIFIED');

  const unknown = catalog.decideRecompute({
    processorId: 'dda_materialize_query',
    changeKind: 'SCHEMA_BREAK',
    priorStateProof: { cacheIdentityHash: 'f'.repeat(64), verified: true },
  });
  assert.equal(unknown.mode, 'FULL');
  assert.equal(unknown.reason, 'INCOMPATIBLE_CHANGE_SEMANTICS');

  const unregistered = catalog.decideRecompute({
    processorId: 'unknown_processor',
    changeKind: 'APPEND_ROWS',
    priorStateProof: { cacheIdentityHash: 'f'.repeat(64), verified: true },
  });
  assert.equal(unregistered.mode, 'FULL');
  assert.equal(unregistered.reason, 'PROCESSOR_NOT_REGISTERED');
});
