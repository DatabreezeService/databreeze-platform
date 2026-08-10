import type { DdaAnalysisPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { AnalysisPlanRepositoryPortV1 } from '../application/analysis-plan-repository.port.js';

function requireProjectScope(tenantScope: TenantScopeV1): void {
  if (tenantScope.scopeType !== 'project' || !tenantScope.workspaceId || !tenantScope.projectId) {
    throw new Error('TENANT_SCOPE_REQUIRED');
  }
}

function scopeKey(tenantScope: TenantScopeV1, id: string): string {
  requireProjectScope(tenantScope);
  const scoped = tenantScope as TenantScopeV1 & {
    readonly workspaceId: string;
    readonly projectId: string;
  };
  return `${scoped.organizationId}|${scoped.workspaceId}|${scoped.projectId}|${id}`;
}

export class InMemoryAnalysisPlanRepositoryAdapter implements AnalysisPlanRepositoryPortV1 {
  readonly #plans = new Map<string, DdaAnalysisPlanV1>();

  public save(plan: DdaAnalysisPlanV1): Promise<void> {
    this.#plans.set(scopeKey(plan.tenantScope, plan.planVersionId), plan);
  }

  public findByVersionId(
    tenantScope: TenantScopeV1,
    planVersionId: string,
  ): Promise<DdaAnalysisPlanV1 | undefined> {
    return Promise.resolve(this.#plans.get(scopeKey(tenantScope, planVersionId)));
  }
}
