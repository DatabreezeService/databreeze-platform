import assert from 'node:assert/strict';

import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import {
  attachDashboardSnapshotBindingProofV1,
  computeDashboardPublicationCanonicalHashV1,
  computeDashboardPublicationInputSelectorHashV1,
  type DashboardSnapshotWithBindingProofV1,
} from '../../../src/features/dda/dashboard/application/dashboard-repository.port.js';
import type { DashboardPublicationMaterializationBindingProofV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication-materialization.port.js';
import { buildMaterializationCacheKeyV1 } from '../../../src/features/dda/refresh/application/materialization-cache-key.js';

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('TEST_ID_INVALID');
  return parsed.value;
}

export function withRefreshSnapshotBindingProof(
  snapshot: DashboardSnapshotV1,
): DashboardSnapshotWithBindingProofV1 {
  if (snapshot.materializationIds.length === 0) throw new Error('TEST_MATERIALIZATION_REQUIRED');
  const normalized = {
    ...snapshot,
    inputSelectorHash: computeDashboardPublicationInputSelectorHashV1(
      snapshot.dashboardVersionId,
      snapshot.materializationIds,
    ),
  };
  const proofs = snapshot.materializationIds.map((materializationId, index) => {
    const suffix = (index + 1).toString(16).padStart(3, '0');
    const materialization = {
      materializationId,
      tenantScope: snapshot.tenantScope,
      dashboardVersionId: snapshot.dashboardVersionId,
      widgetId: stable(`00000000-0000-4000-8000-00000000f${suffix}`),
      analysisPlanVersionId: stable('00000000-0000-4000-8000-00000000f002'),
      datasetVersionId: stable('00000000-0000-4000-8000-00000000f003'),
      semanticVersionId: stable('00000000-0000-4000-8000-00000000f004'),
      metricVersionId: stable('00000000-0000-4000-8000-00000000f005'),
      permissionProjectionVersionId: snapshot.permissionProjectionVersionId,
      parameterHash: 'b'.repeat(64),
      locale: 'vi-VN',
      timezone: 'Asia/Bangkok',
      engineVersion: 'engine-test',
      adapterVersion: 'adapter-test',
      effectivePolicyVersionId: stable('00000000-0000-4000-8000-00000000f006'),
      resultManifestId: stable('00000000-0000-4000-8000-00000000f007'),
      createdAt: snapshot.createdAt,
    } as const;
    const cacheKey = buildMaterializationCacheKeyV1(materialization);
    assert.equal(cacheKey.complete, true);
    if (!cacheKey.complete) throw new Error('TEST_CACHE_KEY_INVALID');
    return {
      schemaVersion: 1,
      materializationId: materialization.materializationId,
      tenantScope: materialization.tenantScope,
      dashboardVersionId: materialization.dashboardVersionId,
      widgetId: materialization.widgetId,
      analysisPlanVersionId: materialization.analysisPlanVersionId,
      datasetVersionId: materialization.datasetVersionId,
      semanticVersionId: materialization.semanticVersionId,
      metricVersionId: materialization.metricVersionId,
      materializationDefinitionId: stable('00000000-0000-4000-8000-00000000f008'),
      resultManifestId: materialization.resultManifestId,
      permissionProjectionVersionId: materialization.permissionProjectionVersionId,
      parameterHash: materialization.parameterHash,
      locale: materialization.locale,
      timezone: materialization.timezone,
      engineVersion: materialization.engineVersion,
      adapterVersion: materialization.adapterVersion,
      effectivePolicyVersionId: materialization.effectivePolicyVersionId,
      cacheIdentityHash: cacheKey.cacheIdentityHash,
      materializationCreatedAt: materialization.createdAt,
    } satisfies DashboardPublicationMaterializationBindingProofV1;
  });
  const canonicalHash = computeDashboardPublicationCanonicalHashV1({
    snapshot: normalized,
    bindingProof: proofs,
  });
  return attachDashboardSnapshotBindingProofV1({ ...normalized, canonicalHash }, proofs);
}
