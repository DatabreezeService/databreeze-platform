import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export const DEPENDENCY_REPOSITORY_PORT = Symbol('DEPENDENCY_REPOSITORY_PORT');

export type BoundInputChangeKindV1 =
  | 'DATASET_VERSION'
  | 'SEMANTIC_VERSION'
  | 'METRIC_VERSION'
  | 'PARAMETER'
  | 'DASHBOARD_VERSION'
  | 'PERMISSION_PROJECTION';

/** Content-safe identity only — consumers must fetch protected data through authorized APIs. */
export interface ContentSafeBoundInputEventV1 {
  readonly eventId: string;
  readonly tenantScope: TenantScopeV1;
  readonly changeKind: BoundInputChangeKindV1;
  readonly referenceId: string;
  readonly occurredAt: string;
  readonly sequence: number;
  readonly authorized: boolean;
}

export interface MaterializationDefinitionBindingV1 {
  readonly materializationDefinitionId: string;
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly dashboardVersionId: string;
  readonly widgetId: string;
  readonly analysisPlanVersionId: string;
  readonly datasetVersionId: string;
  readonly semanticVersionId: string;
  readonly metricVersionId: string;
  readonly permissionProjectionVersionId: string;
  readonly parameterHash: string;
  readonly locale: string;
  readonly timezone: string;
  readonly engineVersion: string;
  readonly adapterVersion: string;
  readonly effectivePolicyVersionId: string;
  readonly processorId: string;
  readonly deleted: boolean;
}

export interface DependencyRepositoryPortV1 {
  findBindingsByReference(
    tenantScope: TenantScopeV1,
    changeKind: BoundInputChangeKindV1,
    referenceId: string,
  ): Promise<readonly MaterializationDefinitionBindingV1[]>;
  isReferenceOwnedByOtherTenant(
    tenantScope: TenantScopeV1,
    changeKind: BoundInputChangeKindV1,
    referenceId: string,
  ): Promise<boolean>;
  rememberProcessedEvent(eventId: string, sequence: number): Promise<void>;
  findProcessedEvent(
    eventId: string,
  ): Promise<{ readonly eventId: string; readonly sequence: number } | undefined>;
  highestSequence(tenantScope: TenantScopeV1): Promise<number>;
  advanceSequence(tenantScope: TenantScopeV1, sequence: number): Promise<void>;
}
