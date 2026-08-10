import type {
  DashboardSnapshotV1,
  DdaRefreshEventV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DdaRefreshStateV1,
  RefreshEventCorrelationV1,
  RefreshRepositoryPortV1,
} from '../application/refresh-repository.port.js';
import type { RefreshRecordV1 } from '../refresh/application/refresh-coordinator.port.js';

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

export class InMemoryRefreshRepositoryAdapter implements RefreshRepositoryPortV1 {
  readonly #states = new Map<string, DdaRefreshStateV1>();
  readonly #snapshots = new Map<string, DashboardSnapshotV1>();
  readonly #events: DdaRefreshEventV1[] = [];
  readonly #correlations: RefreshEventCorrelationV1[] = [];
  readonly #refreshes = new Map<string, RefreshRecordV1>();
  readonly #bySourceEvent = new Map<string, string>();
  readonly #byClientRequest = new Map<string, string>();
  readonly #byFolderReplay = new Map<string, string>();

  public saveState(state: DdaRefreshStateV1): Promise<void> {
    try {
      this.#states.set(scopeKey(state.tenantScope, state.dashboardId), Object.freeze({ ...state }));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public findState(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DdaRefreshStateV1 | undefined> {
    try {
      return Promise.resolve(this.#states.get(scopeKey(tenantScope, dashboardId)));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public saveSnapshot(snapshot: DashboardSnapshotV1): Promise<void> {
    try {
      this.#snapshots.set(scopeKey(snapshot.tenantScope, snapshot.snapshotId), snapshot);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public findSnapshot(
    tenantScope: TenantScopeV1,
    snapshotId: string,
  ): Promise<DashboardSnapshotV1 | undefined> {
    try {
      return Promise.resolve(this.#snapshots.get(scopeKey(tenantScope, snapshotId)));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public recordRefreshEvent(event: DdaRefreshEventV1): Promise<void> {
    try {
      requireProjectScope(event.tenantScope);
      this.#events.push(event);
      this.#correlations.push(
        Object.freeze({
          eventId: event.eventId,
          tenantScope: event.tenantScope,
          dashboardId: event.dashboardId,
          outcomeCode: event.freshnessState,
          occurredAt: event.occurredAt,
        }),
      );
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public saveRefresh(record: RefreshRecordV1): Promise<void> {
    this.#refreshes.set(record.refreshId, Object.freeze({ ...record }));
    for (const sourceEventId of record.sourceEventIds) {
      this.#bySourceEvent.set(sourceEventId, record.refreshId);
    }
    for (const clientRequestId of record.clientRequestIds) {
      this.#byClientRequest.set(clientRequestId, record.refreshId);
    }
    for (const folderReplayKey of record.folderReplayKeys) {
      this.#byFolderReplay.set(folderReplayKey, record.refreshId);
    }
    return Promise.resolve();
  }

  public findRefresh(refreshId: string): Promise<RefreshRecordV1 | undefined> {
    return Promise.resolve(this.#refreshes.get(refreshId));
  }

  public findOpenRefresh(dashboardId: string): Promise<RefreshRecordV1 | undefined> {
    for (const record of this.#refreshes.values()) {
      if (
        record.dashboardId === dashboardId &&
        (record.state === 'PENDING' || record.state === 'RUNNING' || record.state === 'VERIFYING')
      ) {
        return Promise.resolve(record);
      }
    }
    return Promise.resolve(undefined);
  }

  public findByIdempotency(input: {
    readonly tenantScope?: TenantScopeV1;
    readonly sourceEventId?: string;
    readonly clientRequestId?: string;
    readonly folderReplayKey?: string;
  }): Promise<RefreshRecordV1 | undefined> {
    const refreshId =
      (input.sourceEventId ? this.#bySourceEvent.get(input.sourceEventId) : undefined) ??
      (input.clientRequestId ? this.#byClientRequest.get(input.clientRequestId) : undefined) ??
      (input.folderReplayKey ? this.#byFolderReplay.get(input.folderReplayKey) : undefined);
    const record = refreshId ? this.#refreshes.get(refreshId) : undefined;
    if (!record) return Promise.resolve(undefined);
    if (input.tenantScope) {
      const left = scopeKey(input.tenantScope, record.dashboardId);
      const right = scopeKey(record.tenantScope, record.dashboardId);
      if (left !== right) return Promise.resolve(undefined);
    }
    return Promise.resolve(record);
  }

  public async findLatestSnapshotForDashboard(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardSnapshotV1 | undefined> {
    const state = await this.findState(tenantScope, dashboardId);
    if (!state?.lastSnapshotId) return undefined;
    return this.findSnapshot(tenantScope, state.lastSnapshotId);
  }
}
