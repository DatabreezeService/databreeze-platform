import type { DdaAnalysisPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export const ANALYSIS_PLAN_REPOSITORY_PORT = Symbol('ANALYSIS_PLAN_REPOSITORY_PORT');

export interface AnalysisPlanRepositoryPortV1 {
  save(plan: DdaAnalysisPlanV1): Promise<void>;
  findByVersionId(
    tenantScope: TenantScopeV1,
    planVersionId: string,
  ): Promise<DdaAnalysisPlanV1 | undefined>;
}
