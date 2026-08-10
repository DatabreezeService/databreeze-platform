import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type { RefreshRepositoryPortV1 } from '../../application/refresh-repository.port.js';
import type {
  RefreshCoordinatorPortV1,
  RefreshRecordV1,
} from '../application/refresh-coordinator.port.js';
import { InMemoryRefreshCoordinatorAdapter } from './in-memory-refresh-coordinator.adapter.js';

/**
 * DDA-036: keep atomic in-process refresh orchestration helpers, and durably persist
 * open refreshes, idempotency keys, committed snapshots, and refresh state.
 */
export class DurableRefreshCoordinatorAdapter implements RefreshCoordinatorPortV1 {
  readonly #memory: InMemoryRefreshCoordinatorAdapter;
  readonly #repository: RefreshRepositoryPortV1;

  public constructor(repository: RefreshRepositoryPortV1) {
    this.#memory = new InMemoryRefreshCoordinatorAdapter();
    this.#repository = repository;
  }

  public async getCurrentSnapshot(dashboardId: string): Promise<DashboardSnapshotV1 | undefined> {
    const cached = await this.#memory.getCurrentSnapshot(dashboardId);
    if (cached) return cached;
    // Restart path: recover tenant scope from an open or historical refresh execution.
    const open = await this.#repository.findOpenRefresh(dashboardId);
    const tenantScope = open?.tenantScope;
    if (!tenantScope) return undefined;
    const latest = await this.#repository.findLatestSnapshotForDashboard(tenantScope, dashboardId);
    if (latest) {
      await this.#memory.setCurrentSnapshot(dashboardId, latest);
    }
    return latest;
  }

  public async setCurrentSnapshot(
    dashboardId: string,
    snapshot: DashboardSnapshotV1,
  ): Promise<void> {
    await this.#memory.setCurrentSnapshot(dashboardId, snapshot);
    await this.#repository.saveSnapshot(snapshot);
    await this.#repository.saveState({
      dashboardId,
      tenantScope: snapshot.tenantScope,
      freshnessPolicy: 'ON_CHANGE',
      lastSnapshotId: snapshot.snapshotId,
      status: 'CURRENT',
    });
  }

  public async commitSnapshotAtomically(input: {
    readonly dashboardId: string;
    readonly refreshId: string;
    readonly snapshot: DashboardSnapshotV1;
  }): Promise<void> {
    await this.#memory.commitSnapshotAtomically(input);
    await this.#repository.saveSnapshot(input.snapshot);
    await this.#repository.saveState({
      dashboardId: input.dashboardId,
      tenantScope: input.snapshot.tenantScope,
      freshnessPolicy: 'ON_CHANGE',
      lastSnapshotId: input.snapshot.snapshotId,
      lastJobId: input.refreshId,
      status: 'COMMITTED',
    });
    const refresh = await this.#repository.findRefresh(input.refreshId);
    if (refresh) {
      await this.#repository.saveRefresh(
        Object.freeze({
          ...refresh,
          state: 'COMMITTED',
          updatedAtMs: refresh.updatedAtMs + 1,
        }),
      );
    }
  }

  public async saveRefresh(record: RefreshRecordV1): Promise<void> {
    await this.#memory.saveRefresh(record);
    await this.#repository.saveRefresh(record);
  }

  public async findRefresh(refreshId: string): Promise<RefreshRecordV1 | undefined> {
    const cached = await this.#memory.findRefresh(refreshId);
    if (cached) return cached;
    return this.#repository.findRefresh(refreshId);
  }

  public async findOpenRefresh(dashboardId: string): Promise<RefreshRecordV1 | undefined> {
    const cached = await this.#memory.findOpenRefresh(dashboardId);
    if (cached) return cached;
    return this.#repository.findOpenRefresh(dashboardId);
  }

  public async findByIdempotency(input: {
    readonly sourceEventId?: string;
    readonly clientRequestId?: string;
    readonly folderReplayKey?: string;
  }): Promise<RefreshRecordV1 | undefined> {
    const cached = await this.#memory.findByIdempotency(input);
    if (cached) return cached;
    return this.#repository.findByIdempotency(input);
  }
}
