import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { RefreshEventAppendInputV1 } from './refresh-event-bus.js';

export type RefreshLifecycleStateV1 =
  | 'PENDING'
  | 'RUNNING'
  | 'VERIFYING'
  | 'COMMITTED'
  | 'BLOCKED'
  | 'FAILED'
  | 'SUPERSEDED';

export interface RefreshRecordV1 {
  readonly refreshId: string;
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly dashboardVersionId: string;
  readonly permissionProjectionVersionId: string;
  readonly datasetVersionId: string;
  readonly definitionIds: readonly string[];
  readonly inputSelectorHash: string;
  readonly sourceEventIds: readonly string[];
  readonly clientRequestIds: readonly string[];
  readonly folderReplayKeys: readonly string[];
  readonly state: RefreshLifecycleStateV1;
  readonly revision: number;
  readonly leaseId?: string;
  readonly debounceWindowMs: number;
  readonly openedAtMs: number;
  readonly updatedAtMs: number;
}

export interface RefreshTriggerReservationInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly sourceEventId: string;
  readonly dashboardId: string;
  readonly dashboardVersionId: string;
  readonly permissionProjectionVersionId: string;
  readonly datasetVersionId: string;
  readonly definitionIds: readonly string[];
  readonly inputSelectorHash: string;
  readonly debounceWindowMs: number;
  readonly occurredAtMs: number;
  readonly clientRequestId: string;
  readonly folderReplayKey: string;
}

export interface RefreshTriggerReservationResultV1 {
  readonly record: RefreshRecordV1;
  readonly idempotentReplay: boolean;
  readonly coalesced: boolean;
}

export interface RefreshLifecycleTransitionInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly refreshId: string;
  readonly dashboardId: string;
  readonly expectedRevision: number;
  readonly expectedState: RefreshLifecycleStateV1;
  readonly expectedLeaseId?: string;
  readonly nextState: RefreshLifecycleStateV1;
  readonly nextLeaseId?: string;
  readonly updatedAtMs: number;
}

export interface RefreshCoordinatorPortV1 {
  getCurrentSnapshot(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardSnapshotV1 | undefined>;
  setCurrentSnapshot(
    tenantScope: TenantScopeV1,
    dashboardId: string,
    snapshot: DashboardSnapshotV1,
  ): Promise<void>;
  commitSnapshotAtomically(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly refreshId: string;
    readonly expectedRevision: number;
    readonly expectedLeaseId: string;
    readonly expectedInputSelectorHash: string;
    readonly snapshot: DashboardSnapshotV1;
    readonly event?: RefreshEventAppendInputV1;
  }): Promise<void>;
  reserveRefreshTrigger(
    input: RefreshTriggerReservationInputV1,
  ): Promise<RefreshTriggerReservationResultV1>;
  transitionRefresh(input: RefreshLifecycleTransitionInputV1): Promise<RefreshRecordV1>;
  saveRefresh(record: RefreshRecordV1): Promise<void>;
  findRefresh(tenantScope: TenantScopeV1, refreshId: string): Promise<RefreshRecordV1 | undefined>;
  findOpenRefresh(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<RefreshRecordV1 | undefined>;
  findByIdempotency(input: {
    readonly tenantScope: TenantScopeV1;
    readonly sourceEventId?: string;
    readonly clientRequestId?: string;
    readonly folderReplayKey?: string;
  }): Promise<RefreshRecordV1 | undefined>;
}
