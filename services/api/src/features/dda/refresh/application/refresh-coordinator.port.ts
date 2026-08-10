import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

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
  readonly leaseId?: string;
  readonly debounceWindowMs: number;
  readonly openedAtMs: number;
  readonly updatedAtMs: number;
}

export interface RefreshCoordinatorPortV1 {
  getCurrentSnapshot(dashboardId: string): Promise<DashboardSnapshotV1 | undefined>;
  setCurrentSnapshot(dashboardId: string, snapshot: DashboardSnapshotV1): Promise<void>;
  commitSnapshotAtomically(input: {
    readonly dashboardId: string;
    readonly refreshId: string;
    readonly snapshot: DashboardSnapshotV1;
  }): Promise<void>;
  saveRefresh(record: RefreshRecordV1): Promise<void>;
  findRefresh(refreshId: string): Promise<RefreshRecordV1 | undefined>;
  findOpenRefresh(dashboardId: string): Promise<RefreshRecordV1 | undefined>;
  findByIdempotency(input: {
    readonly sourceEventId?: string;
    readonly clientRequestId?: string;
    readonly folderReplayKey?: string;
  }): Promise<RefreshRecordV1 | undefined>;
}
