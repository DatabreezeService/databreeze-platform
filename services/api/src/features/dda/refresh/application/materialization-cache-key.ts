import { createHash } from 'node:crypto';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

/** DDA-029: every value- or authorization-affecting dimension for materialization cache identity. */
export interface MaterializationCacheKeyInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly permissionProjectionVersionId: string;
  readonly dashboardVersionId: string;
  readonly widgetId: string;
  readonly analysisPlanVersionId: string;
  readonly datasetVersionId: string;
  readonly semanticVersionId: string;
  readonly metricVersionId: string;
  readonly parameterHash: string;
  readonly locale: string;
  readonly timezone: string;
  readonly engineVersion: string;
  readonly adapterVersion: string;
  readonly effectivePolicyVersionId: string;
}

export type MaterializationCacheKeyResultV1 =
  | {
      readonly complete: true;
      readonly cacheIdentityHash: string;
      readonly canonical: string;
    }
  | {
      readonly complete: false;
      readonly code: 'INCOMPLETE_CACHE_IDENTITY';
      readonly missing: readonly string[];
    };

const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function scopeCanonical(tenantScope: TenantScopeV1): string | undefined {
  if (tenantScope.scopeType !== 'project' || !tenantScope.workspaceId || !tenantScope.projectId) {
    return undefined;
  }
  return [
    tenantScope.scopeType,
    tenantScope.organizationId,
    tenantScope.workspaceId,
    tenantScope.projectId,
  ].join('|');
}

function present(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Canonicalize and hash a complete cache key; incomplete keys never reuse results. */
export function buildMaterializationCacheKeyV1(
  input: MaterializationCacheKeyInputV1,
): MaterializationCacheKeyResultV1 {
  const missing: string[] = [];
  const tenantScopeKey = scopeCanonical(input.tenantScope);
  if (!tenantScopeKey) missing.push('tenantScope');

  const requiredIds: Array<keyof MaterializationCacheKeyInputV1> = [
    'permissionProjectionVersionId',
    'dashboardVersionId',
    'widgetId',
    'analysisPlanVersionId',
    'datasetVersionId',
    'semanticVersionId',
    'metricVersionId',
    'effectivePolicyVersionId',
  ];
  for (const field of requiredIds) {
    const value = input[field];
    if (!present(value) || !ID_PATTERN.test(value)) missing.push(field);
  }
  if (!present(input.parameterHash) || !HASH_PATTERN.test(input.parameterHash)) {
    missing.push('parameterHash');
  }
  for (const field of ['locale', 'timezone', 'engineVersion', 'adapterVersion'] as const) {
    if (!present(input[field])) missing.push(field);
  }

  if (missing.length > 0) {
    return Object.freeze({
      complete: false,
      code: 'INCOMPLETE_CACHE_IDENTITY',
      missing: Object.freeze([...missing]),
    });
  }

  const canonicalObject = {
    adapterVersion: input.adapterVersion,
    analysisPlanVersionId: input.analysisPlanVersionId,
    dashboardVersionId: input.dashboardVersionId,
    datasetVersionId: input.datasetVersionId,
    effectivePolicyVersionId: input.effectivePolicyVersionId,
    engineVersion: input.engineVersion,
    locale: input.locale,
    metricVersionId: input.metricVersionId,
    parameterHash: input.parameterHash,
    permissionProjectionVersionId: input.permissionProjectionVersionId,
    semanticVersionId: input.semanticVersionId,
    tenantScope: tenantScopeKey,
    timezone: input.timezone,
    widgetId: input.widgetId,
  };
  const canonical = JSON.stringify(canonicalObject);
  const cacheIdentityHash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return Object.freeze({ complete: true, cacheIdentityHash, canonical });
}
