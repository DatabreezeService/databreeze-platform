import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type {
  RefreshCoordinatorPortV1,
  RefreshRecordV1,
} from '../application/refresh-coordinator.port.js';

export type {
  RefreshCoordinatorPortV1,
  RefreshLifecycleStateV1,
  RefreshRecordV1,
} from '../application/refresh-coordinator.port.js';

export class InMemoryRefreshCoordinatorAdapter implements RefreshCoordinatorPortV1 {
  readonly #snapshots = new Map<string, DashboardSnapshotV1>();
  readonly #refreshes = new Map<string, RefreshRecordV1>();
  readonly #bySourceEvent = new Map<string, string>();
  readonly #byClientRequest = new Map<string, string>();
  readonly #byFolderReplay = new Map<string, string>();
  readonly #failCommit: boolean;

  public constructor(options: { readonly failCommit?: boolean } = {}) {
    this.#failCommit = options.failCommit === true;
  }

  public async getCurrentSnapshot(dashboardId: string): Promise<DashboardSnapshotV1 | undefined> {
    return this.#snapshots.get(dashboardId);
  }

  public async setCurrentSnapshot(
    dashboardId: string,
    snapshot: DashboardSnapshotV1,
  ): Promise<void> {
    this.#snapshots.set(dashboardId, snapshot);
  }

  public async commitSnapshotAtomically(input: {
    readonly dashboardId: string;
    readonly refreshId: string;
    readonly snapshot: DashboardSnapshotV1;
  }): Promise<void> {
    if (this.#failCommit) {
      throw new Error('SNAPSHOT_COMMIT_FAILED');
    }
    const refresh = this.#refreshes.get(input.refreshId);
    this.#snapshots.set(input.dashboardId, input.snapshot);
    if (refresh) {
      this.#refreshes.set(
        input.refreshId,
        Object.freeze({ ...refresh, state: 'COMMITTED', updatedAtMs: refresh.updatedAtMs + 1 }),
      );
    }
  }

  public async saveRefresh(record: RefreshRecordV1): Promise<void> {
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
  }

  public async findRefresh(refreshId: string): Promise<RefreshRecordV1 | undefined> {
    return this.#refreshes.get(refreshId);
  }

  public async findOpenRefresh(dashboardId: string): Promise<RefreshRecordV1 | undefined> {
    for (const record of this.#refreshes.values()) {
      if (
        record.dashboardId === dashboardId &&
        (record.state === 'PENDING' || record.state === 'RUNNING' || record.state === 'VERIFYING')
      ) {
        return record;
      }
    }
    return undefined;
  }

  public async findByIdempotency(input: {
    readonly sourceEventId?: string;
    readonly clientRequestId?: string;
    readonly folderReplayKey?: string;
  }): Promise<RefreshRecordV1 | undefined> {
    const refreshId =
      (input.sourceEventId ? this.#bySourceEvent.get(input.sourceEventId) : undefined) ??
      (input.clientRequestId ? this.#byClientRequest.get(input.clientRequestId) : undefined) ??
      (input.folderReplayKey ? this.#byFolderReplay.get(input.folderReplayKey) : undefined);
    return refreshId ? this.#refreshes.get(refreshId) : undefined;
  }
}
