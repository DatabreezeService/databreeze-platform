import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { ExecutionRouteDecisionV1 } from './execution-route-decision.js';

export const EXECUTION_ROUTE_REPOSITORY_PORT = Symbol('EXECUTION_ROUTE_REPOSITORY_PORT');

export interface ExecutionRouteRepositoryPortV1 {
  save(decision: ExecutionRouteDecisionV1): Promise<void>;
  findExact(input: {
    readonly tenantScope: TenantScopeV1;
    readonly decisionId: ExecutionRouteDecisionV1['decisionId'];
  }): Promise<ExecutionRouteDecisionV1 | undefined>;
}
