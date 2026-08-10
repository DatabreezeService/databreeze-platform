import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  BoundInputChangeKindV1,
  DependencyRepositoryPortV1,
  MaterializationDefinitionBindingV1,
} from '../application/dependency-repository.port.js';

function requireProjectScope(tenantScope: TenantScopeV1): TenantScopeV1 & {
  readonly scopeType: 'project';
  readonly workspaceId: string;
  readonly projectId: string;
} {
  if (tenantScope.scopeType !== 'project' || !tenantScope.workspaceId || !tenantScope.projectId) {
    throw new Error('TENANT_SCOPE_REQUIRED');
  }
  return tenantScope;
}

function scopeKey(tenantScope: TenantScopeV1): string {
  const scoped = requireProjectScope(tenantScope);
  return `${scoped.organizationId}|${scoped.workspaceId}|${scoped.projectId}`;
}

function sameScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  return scopeKey(left) === scopeKey(right);
}

function matchesReference(
  binding: MaterializationDefinitionBindingV1,
  changeKind: BoundInputChangeKindV1,
  referenceId: string,
): boolean {
  switch (changeKind) {
    case 'DATASET_VERSION':
      return binding.datasetVersionId === referenceId;
    case 'SEMANTIC_VERSION':
      return binding.semanticVersionId === referenceId;
    case 'METRIC_VERSION':
      return binding.metricVersionId === referenceId;
    case 'PARAMETER':
      return binding.materializationDefinitionId === referenceId;
    case 'DASHBOARD_VERSION':
      return binding.dashboardVersionId === referenceId;
    case 'PERMISSION_PROJECTION':
      return binding.permissionProjectionVersionId === referenceId;
    default:
      return false;
  }
}

export class InMemoryDependencyRepositoryAdapter implements DependencyRepositoryPortV1 {
  readonly #bindings: MaterializationDefinitionBindingV1[] = [];
  readonly #processed = new Map<string, { readonly eventId: string; readonly sequence: number }>();
  readonly #highestSequence = new Map<string, number>();
  readonly #observedPayloadKeys = new Set<string>();

  public seedBindings(bindings: readonly MaterializationDefinitionBindingV1[]): void {
    for (const binding of bindings) {
      requireProjectScope(binding.tenantScope);
      this.#bindings.push(Object.freeze({ ...binding }));
    }
  }

  /** Test helper: proves event payload value keys were never observed by the repository. */
  public observedPayloadKeys(): string[] {
    return [...this.#observedPayloadKeys];
  }

  public async findBindingsByReference(
    tenantScope: TenantScopeV1,
    changeKind: BoundInputChangeKindV1,
    referenceId: string,
  ): Promise<readonly MaterializationDefinitionBindingV1[]> {
    requireProjectScope(tenantScope);
    return this.#bindings.filter(
      (binding) =>
        sameScope(binding.tenantScope, tenantScope) &&
        !binding.deleted &&
        matchesReference(binding, changeKind, referenceId),
    );
  }

  public async isReferenceOwnedByOtherTenant(
    tenantScope: TenantScopeV1,
    changeKind: BoundInputChangeKindV1,
    referenceId: string,
  ): Promise<boolean> {
    requireProjectScope(tenantScope);
    return this.#bindings.some(
      (binding) =>
        !sameScope(binding.tenantScope, tenantScope) &&
        matchesReference(binding, changeKind, referenceId),
    );
  }

  public async rememberProcessedEvent(eventId: string, sequence: number): Promise<void> {
    this.#processed.set(eventId, Object.freeze({ eventId, sequence }));
  }

  public async findProcessedEvent(
    eventId: string,
  ): Promise<{ readonly eventId: string; readonly sequence: number } | undefined> {
    return this.#processed.get(eventId);
  }

  public async highestSequence(tenantScope: TenantScopeV1): Promise<number> {
    return this.#highestSequence.get(scopeKey(tenantScope)) ?? 0;
  }

  public async advanceSequence(tenantScope: TenantScopeV1, sequence: number): Promise<void> {
    const key = scopeKey(tenantScope);
    const current = this.#highestSequence.get(key) ?? 0;
    if (sequence > current) this.#highestSequence.set(key, sequence);
  }
}
