import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type { RefreshRepositoryPortV1 } from '../../application/refresh-repository.port.js';
import type {
  RefreshCoordinatorPortV1,
  RefreshRecordV1,
} from '../application/refresh-coordinator.port.js';
import { InMemoryRefreshCoordinatorAdapter } from './in-memory-refresh-coordinator.adapter.js';

/**
 * DDA-036: keep atomic in-process refresh orchestration, and durably persist
 * committed snapshots / refresh state through the metadata-only refresh repository.
 */
export class DurableRefreshCoordinatorAdapter implements RefreshCoordinatorPortV1 {
  readonly #memory: InMemoryRefreshCoordinatorAdapter;
  readonly #repository: RefreshRepositoryPortV1;

  public constructor(repository: RefreshRepositoryPortV1) {
    this.#memory = new InMemoryRefreshCoordinatorAdapter();
    this.#repository = repository;
  }

  public getCurrentSnapshot(dashboardId: string): Promise<DashboardSnapshotV1 | undefined> {
    return this.#memory.getCurrentSnapshot(dashboardId);
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
  }

  public saveRefresh(record: RefreshRecordV1): Promise<void> {
    return this.#memory.saveRefresh(record);
  }

  public findRefresh(refreshId: string): Promise<RefreshRecordV1 | undefined> {
    return this.#memory.findRefresh(refreshId);
  }

  public findOpenRefresh(dashboardId: string): Promise<RefreshRecordV1 | undefined> {
    return this.#memory.findOpenRefresh(dashboardId);
  }

  public findByIdempotency(input: {
    readonly sourceEventId?: string;
    readonly clientRequestId?: string;
    readonly folderReplayKey?: string;
  }): Promise<RefreshRecordV1 | undefined> {
    return this.#memory.findByIdempotency(input);
  }
}
