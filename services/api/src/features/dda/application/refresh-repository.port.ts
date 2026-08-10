import type {
  DdaRefreshEventV1,
  DashboardSnapshotV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { RefreshRecordV1 } from '../refresh/application/refresh-coordinator.port.js';

export const REFRESH_REPOSITORY_PORT = Symbol('REFRESH_REPOSITORY_PORT');

export interface DdaRefreshStateV1 {
  readonly dashboardId: string;
  readonly tenantScope: TenantScopeV1;
  readonly freshnessPolicy: 'ON_CHANGE' | 'MANUAL' | 'SCHEDULED';
  readonly lastSnapshotId?: string;
  readonly lastJobId?: string;
  readonly status: string;
  readonly reasonCode?: string;
}

export interface RefreshEventCorrelationV1 {
  readonly eventId: string;
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly refreshId?: string;
  readonly outcomeCode: string;
  readonly occurredAt: string;
}

export interface RefreshRepositoryPortV1 {
  saveState(state: DdaRefreshStateV1): Promise<void>;
  findState(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DdaRefreshStateV1 | undefined>;
  saveSnapshot(snapshot: DashboardSnapshotV1): Promise<void>;
  findSnapshot(
    tenantScope: TenantScopeV1,
    snapshotId: string,
  ): Promise<DashboardSnapshotV1 | undefined>;
  recordRefreshEvent(event: DdaRefreshEventV1): Promise<void>;
  saveRefresh(record: RefreshRecordV1): Promise<void>;
  findRefresh(refreshId: string): Promise<RefreshRecordV1 | undefined>;
  findOpenRefresh(dashboardId: string): Promise<RefreshRecordV1 | undefined>;
  findByIdempotency(input: {
    readonly tenantScope?: TenantScopeV1;
    readonly sourceEventId?: string;
    readonly clientRequestId?: string;
    readonly folderReplayKey?: string;
  }): Promise<RefreshRecordV1 | undefined>;
  findLatestSnapshotForDashboard(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardSnapshotV1 | undefined>;
}
