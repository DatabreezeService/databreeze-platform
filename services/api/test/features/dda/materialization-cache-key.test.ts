import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  buildMaterializationCacheKeyV1,
  type MaterializationCacheKeyInputV1,
} from '../../../src/features/dda/refresh/application/materialization-cache-key.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

const otherScopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000011',
  workspaceId: '00000000-0000-4000-8000-000000000012',
  projectId: '00000000-0000-4000-8000-000000000013',
});
assert.equal(otherScopeResult.accepted, true);
const otherScope = otherScopeResult.accepted ? otherScopeResult.value : (null as never);

function baseKey(
  overrides: Partial<MaterializationCacheKeyInputV1> = {},
): MaterializationCacheKeyInputV1 {
  return {
    tenantScope: scope,
    permissionProjectionVersionId: '00000000-0000-4000-8000-000000000021',
    dashboardVersionId: '00000000-0000-4000-8000-000000000022',
    widgetId: '00000000-0000-4000-8000-000000000023',
    analysisPlanVersionId: '00000000-0000-4000-8000-000000000024',
    datasetVersionId: '00000000-0000-4000-8000-000000000025',
    semanticVersionId: '00000000-0000-4000-8000-000000000026',
    metricVersionId: '00000000-0000-4000-8000-000000000027',
    parameterHash: 'a'.repeat(64),
    locale: 'vi',
    timezone: 'Asia/Ho_Chi_Minh',
    engineVersion: 'engine-1.0.0',
    adapterVersion: 'adapter-1.0.0',
    effectivePolicyVersionId: '00000000-0000-4000-8000-000000000028',
    ...overrides,
  };
}

void test('[DDA-029] complete cache key is stable and includes every value-affecting dimension', () => {
  const first = buildMaterializationCacheKeyV1(baseKey());
  const second = buildMaterializationCacheKeyV1(baseKey());
  assert.equal(first.complete, true);
  assert.equal(second.complete, true);
  if (!first.complete || !second.complete) return;
  assert.match(first.cacheIdentityHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.cacheIdentityHash, second.cacheIdentityHash);
});

void test('[DDA-029] cache keys collide only when every dimension matches', () => {
  const baseline = buildMaterializationCacheKeyV1(baseKey());
  assert.equal(baseline.complete, true);
  if (!baseline.complete) return;

  const mutations: Array<[string, MaterializationCacheKeyInputV1]> = [
    ['tenantScope', baseKey({ tenantScope: otherScope })],
    [
      'permissionProjectionVersionId',
      baseKey({ permissionProjectionVersionId: '00000000-0000-4000-8000-000000000031' }),
    ],
    [
      'dashboardVersionId',
      baseKey({ dashboardVersionId: '00000000-0000-4000-8000-000000000032' }),
    ],
    ['widgetId', baseKey({ widgetId: '00000000-0000-4000-8000-000000000033' })],
    [
      'analysisPlanVersionId',
      baseKey({ analysisPlanVersionId: '00000000-0000-4000-8000-000000000034' }),
    ],
    ['datasetVersionId', baseKey({ datasetVersionId: '00000000-0000-4000-8000-000000000035' })],
    ['semanticVersionId', baseKey({ semanticVersionId: '00000000-0000-4000-8000-000000000036' })],
    ['metricVersionId', baseKey({ metricVersionId: '00000000-0000-4000-8000-000000000037' })],
    ['parameterHash', baseKey({ parameterHash: 'b'.repeat(64) })],
    ['locale', baseKey({ locale: 'en' })],
    ['timezone', baseKey({ timezone: 'UTC' })],
    ['engineVersion', baseKey({ engineVersion: 'engine-2.0.0' })],
    ['adapterVersion', baseKey({ adapterVersion: 'adapter-2.0.0' })],
    [
      'effectivePolicyVersionId',
      baseKey({ effectivePolicyVersionId: '00000000-0000-4000-8000-000000000038' }),
    ],
  ];

  for (const [dimension, input] of mutations) {
    const mutated = buildMaterializationCacheKeyV1(input);
    assert.equal(mutated.complete, true, dimension);
    if (!mutated.complete) continue;
    assert.notEqual(
      mutated.cacheIdentityHash,
      baseline.cacheIdentityHash,
      `dimension ${dimension} must change cache identity`,
    );
  }
});

void test('[DDA-029] incomplete or unknown dimensions force recomputation and never reuse a result', () => {
  const incomplete = buildMaterializationCacheKeyV1(
    baseKey({
      parameterHash: '',
      locale: '',
      permissionProjectionVersionId: undefined as unknown as string,
    }),
  );
  assert.equal(incomplete.complete, false);
  if (incomplete.complete) return;
  assert.equal(incomplete.code, 'INCOMPLETE_CACHE_IDENTITY');
  assert.ok(incomplete.missing.includes('parameterHash'));
  assert.ok(incomplete.missing.includes('locale'));
  assert.ok(incomplete.missing.includes('permissionProjectionVersionId'));
});
