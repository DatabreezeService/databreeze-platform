import { tenantScopesEqualV1 } from '@databreeze/domain/tenant-scope/v1';

import type { ExecutionRouteDecisionV1 } from '../application/execution-route-decision.js';
import type { ExecutionRouteRepositoryPortV1 } from '../application/execution-route-repository.port.js';

/** DSO-024: exact-scope immutable route decision repository used only outside production. */
export class InMemoryExecutionRouteRepositoryAdapter implements ExecutionRouteRepositoryPortV1 {
  private readonly decisions = new Map<string, ExecutionRouteDecisionV1>();

  public async save(decision: ExecutionRouteDecisionV1): Promise<void> {
    await Promise.resolve();
    const existing = this.decisions.get(decision.decisionId);
    if (existing !== undefined) {
      if (JSON.stringify(existing) === JSON.stringify(decision)) return;
      throw new Error('DSO_IMMUTABLE_EXECUTION_ROUTE_DECISION');
    }
    for (const candidate of this.decisions.values()) {
      if (candidate.routeId === decision.routeId && candidate.revision === decision.revision)
        throw new Error('DSO_EXECUTION_ROUTE_REVISION_CONFLICT');
    }
    this.decisions.set(decision.decisionId, decision);
  }

  public async findExact(
    input: Parameters<ExecutionRouteRepositoryPortV1['findExact']>[0],
  ): Promise<ExecutionRouteDecisionV1 | undefined> {
    await Promise.resolve();
    const decision = this.decisions.get(input.decisionId);
    return decision !== undefined && tenantScopesEqualV1(decision.tenantScope, input.tenantScope)
      ? decision
      : undefined;
  }
}
