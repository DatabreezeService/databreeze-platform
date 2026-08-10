import type {
  DashboardSnapshotV1,
  DdaRefreshEventV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DdaRefreshStateV1,
  RefreshRepositoryPortV1,
} from '../application/refresh-repository.port.js';

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
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
