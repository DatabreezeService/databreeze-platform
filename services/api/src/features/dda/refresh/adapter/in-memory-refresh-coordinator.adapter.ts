import { randomUUID } from 'node:crypto';

import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';
import { tenantScopeKeyV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  RefreshCoordinatorPortV1,
  RefreshLifecycleTransitionInputV1,
  RefreshRecordV1,
  RefreshTriggerReservationInputV1,
  RefreshTriggerReservationResultV1,
} from '../application/refresh-coordinator.port.js';
import {
  readDashboardSnapshotBindingProofV1,
  validateDashboardSnapshotBindingProofV1,
} from '../../dashboard/application/dashboard-repository.port.js';

export type {
  RefreshCoordinatorPortV1,
  RefreshLifecycleStateV1,
  RefreshRecordV1,
} from '../application/refresh-coordinator.port.js';

function scopedKey(tenantScope: TenantScopeV1, id: string): string {
  return `${tenantScopeKeyV1(tenantScope)}|${id}`;
}

function idempotencyKey(
  tenantScope: TenantScopeV1,
  kind: 'SOURCE_EVENT' | 'CLIENT_REQUEST' | 'FOLDER_REPLAY',
  value: string,
): string {
  return `${scopedKey(tenantScope, kind)}|${value}`;
}

function appendUnique(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : Object.freeze([...values, value]);
}

function compatible(left: RefreshRecordV1, right: RefreshTriggerReservationInputV1): boolean {
  return (
    left.dashboardVersionId === right.dashboardVersionId &&
    left.permissionProjectionVersionId === right.permissionProjectionVersionId &&
    left.datasetVersionId === right.datasetVersionId &&
    left.definitionIds.length === right.definitionIds.length &&
    left.definitionIds.every((id, index) => id === right.definitionIds[index])
  );
}

function openState(state: RefreshRecordV1['state']): boolean {
  return state === 'PENDING' || state === 'RUNNING' || state === 'VERIFYING';
}

function staleSnapshot(current: DashboardSnapshotV1, next: DashboardSnapshotV1): boolean {
  if (current.snapshotId === next.snapshotId) return false;
  return Date.parse(current.createdAt) > Date.parse(next.createdAt);
}

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

  public getCurrentSnapshot(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardSnapshotV1 | undefined> {
    return Promise.resolve(this.#snapshots.get(scopedKey(tenantScope, dashboardId)));
  }

  public setCurrentSnapshot(
    tenantScope: TenantScopeV1,
    dashboardId: string,
    snapshot: DashboardSnapshotV1,
  ): Promise<void> {
    const bindingProof = readDashboardSnapshotBindingProofV1(snapshot);
    if (bindingProof === undefined) {
      return Promise.reject(new Error('DDA_SNAPSHOT_BINDING_PROOF_REQUIRED'));
    }
    if (validateDashboardSnapshotBindingProofV1({ snapshot, bindingProof }) === undefined) {
      return Promise.reject(new Error('DDA_SNAPSHOT_BINDING_PROOF_INVALID'));
    }
    if (
      tenantScopeKeyV1(tenantScope) !== tenantScopeKeyV1(snapshot.tenantScope) ||
      dashboardId.length === 0
    ) {
      return Promise.reject(new Error('DDA_REFRESH_SCOPE_MISMATCH'));
    }
    this.#snapshots.set(scopedKey(tenantScope, dashboardId), snapshot);
    return Promise.resolve();
  }

  public commitSnapshotAtomically(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly refreshId: string;
    readonly expectedRevision: number;
    readonly expectedLeaseId: string;
    readonly expectedInputSelectorHash: string;
    readonly snapshot: DashboardSnapshotV1;
  }): Promise<void> {
    if (this.#failCommit) {
      return Promise.reject(new Error('SNAPSHOT_COMMIT_FAILED'));
    }
    const tenantScope = input.tenantScope;
    if (tenantScopeKeyV1(tenantScope) !== tenantScopeKeyV1(input.snapshot.tenantScope)) {
      return Promise.reject(new Error('DDA_REFRESH_SCOPE_MISMATCH'));
    }
    const bindingProof = readDashboardSnapshotBindingProofV1(input.snapshot);
    if (bindingProof === undefined) {
      return Promise.reject(new Error('DDA_SNAPSHOT_BINDING_PROOF_REQUIRED'));
    }
    if (
      validateDashboardSnapshotBindingProofV1({ snapshot: input.snapshot, bindingProof }) ===
      undefined
    ) {
      return Promise.reject(new Error('DDA_SNAPSHOT_BINDING_PROOF_INVALID'));
    }
    const refreshKey = scopedKey(tenantScope, input.refreshId);
    const refresh = this.#refreshes.get(refreshKey);
    if (!refresh) return Promise.reject(new Error('DDA_REFRESH_NOT_FOUND'));
    const snapshotKey = scopedKey(tenantScope, input.dashboardId);
    const current = this.#snapshots.get(snapshotKey);
    if (
      refresh.state === 'COMMITTED' &&
      refresh.revision === input.expectedRevision + 1 &&
      current?.snapshotId === input.snapshot.snapshotId &&
      current.canonicalHash === input.snapshot.canonicalHash
    ) {
      return Promise.resolve();
    }
    if (
      refresh.dashboardId !== input.dashboardId ||
      refresh.state !== 'VERIFYING' ||
      refresh.revision !== input.expectedRevision ||
      refresh.leaseId !== input.expectedLeaseId ||
      refresh.inputSelectorHash !== input.expectedInputSelectorHash ||
      input.snapshot.dashboardVersionId !== refresh.dashboardVersionId ||
      input.snapshot.permissionProjectionVersionId !== refresh.permissionProjectionVersionId ||
      input.snapshot.inputSelectorHash !== input.expectedInputSelectorHash
    ) {
      return Promise.reject(new Error('DDA_REFRESH_COMMIT_STALE'));
    }
    if (current && staleSnapshot(current, input.snapshot)) {
      return Promise.reject(new Error('DDA_REFRESH_COMMIT_STALE'));
    }
    this.#snapshots.set(snapshotKey, input.snapshot);
    this.#refreshes.set(
      refreshKey,
      Object.freeze({
        ...refresh,
        state: 'COMMITTED',
        revision: refresh.revision + 1,
        updatedAtMs: refresh.updatedAtMs + 1,
      }),
    );
    return Promise.resolve();
  }

  public reserveRefreshTrigger(
    input: RefreshTriggerReservationInputV1,
  ): Promise<RefreshTriggerReservationResultV1> {
    const keys = [
      {
        kind: 'SOURCE_EVENT' as const,
        value: input.sourceEventId,
        map: this.#bySourceEvent,
      },
      {
        kind: 'CLIENT_REQUEST' as const,
        value: input.clientRequestId,
        map: this.#byClientRequest,
      },
      {
        kind: 'FOLDER_REPLAY' as const,
        value: input.folderReplayKey,
        map: this.#byFolderReplay,
      },
    ];
    for (const candidate of keys) {
      const refreshId = candidate.map.get(
        idempotencyKey(input.tenantScope, candidate.kind, candidate.value),
      );
      if (refreshId !== undefined) {
        const existing = this.#refreshes.get(scopedKey(input.tenantScope, refreshId));
        if (!existing) return Promise.reject(new Error('DDA_REFRESH_IDEMPOTENCY_CORRUPT'));
        return Promise.resolve(
          Object.freeze({ record: existing, idempotentReplay: true, coalesced: false }),
        );
      }
    }

    const open = [...this.#refreshes.values()].find(
      (record) =>
        tenantScopeKeyV1(record.tenantScope) === tenantScopeKeyV1(input.tenantScope) &&
        record.dashboardId === input.dashboardId &&
        openState(record.state),
    );
    if (
      open &&
      compatible(open, input) &&
      input.occurredAtMs - open.openedAtMs <= open.debounceWindowMs
    ) {
      const coalesced = Object.freeze({
        ...open,
        revision: open.revision + 1,
        inputSelectorHash: input.inputSelectorHash,
        sourceEventIds: appendUnique(open.sourceEventIds, input.sourceEventId),
        clientRequestIds: appendUnique(open.clientRequestIds, input.clientRequestId),
        folderReplayKeys: appendUnique(open.folderReplayKeys, input.folderReplayKey),
        updatedAtMs: input.occurredAtMs,
      });
      this.#storeRefresh(coalesced);
      return Promise.resolve(
        Object.freeze({ record: coalesced, idempotentReplay: false, coalesced: true }),
      );
    }

    if (open && !compatible(open, input)) {
      this.#storeRefresh(
        Object.freeze({
          ...open,
          state: 'SUPERSEDED',
          revision: open.revision + 1,
          updatedAtMs: input.occurredAtMs,
        }),
      );
    }

    const created = Object.freeze({
      refreshId: randomUUID(),
      tenantScope: input.tenantScope,
      dashboardId: input.dashboardId,
      dashboardVersionId: input.dashboardVersionId,
      permissionProjectionVersionId: input.permissionProjectionVersionId,
      datasetVersionId: input.datasetVersionId,
      definitionIds: Object.freeze([...input.definitionIds]),
      inputSelectorHash: input.inputSelectorHash,
      sourceEventIds: Object.freeze([input.sourceEventId]),
      clientRequestIds: Object.freeze([input.clientRequestId]),
      folderReplayKeys: Object.freeze([input.folderReplayKey]),
      state: 'PENDING' as const,
      revision: 1,
      debounceWindowMs: input.debounceWindowMs,
      openedAtMs: input.occurredAtMs,
      updatedAtMs: input.occurredAtMs,
    });
    this.#storeRefresh(created);
    return Promise.resolve(
      Object.freeze({ record: created, idempotentReplay: false, coalesced: false }),
    );
  }

  public saveRefresh(record: RefreshRecordV1): Promise<void> {
    try {
      this.#storeRefresh(record);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public transitionRefresh(input: RefreshLifecycleTransitionInputV1): Promise<RefreshRecordV1> {
    if (
      (input.nextState === 'RUNNING' || input.nextState === 'VERIFYING') &&
      input.nextLeaseId === undefined
    ) {
      return Promise.reject(new Error('DDA_REFRESH_LEASE_REQUIRED'));
    }
    const refreshKey = scopedKey(input.tenantScope, input.refreshId);
    const existing = this.#refreshes.get(refreshKey);
    if (
      existing === undefined ||
      existing.dashboardId !== input.dashboardId ||
      existing.revision !== input.expectedRevision ||
      existing.state !== input.expectedState ||
      (existing.leaseId ?? undefined) !== input.expectedLeaseId
    ) {
      return Promise.reject(new Error('DDA_REFRESH_TRANSITION_STALE'));
    }
    const { leaseId: _existingLeaseId, ...withoutLease } = existing;
    void _existingLeaseId;
    const transitioned = Object.freeze({
      ...(input.nextLeaseId === undefined ? withoutLease : existing),
      state: input.nextState,
      revision: existing.revision + 1,
      ...(input.nextLeaseId === undefined ? {} : { leaseId: input.nextLeaseId }),
      updatedAtMs: input.updatedAtMs,
    });
    this.#storeRefresh(transitioned);
    return Promise.resolve(transitioned);
  }

  public findRefresh(
    tenantScope: TenantScopeV1,
    refreshId: string,
  ): Promise<RefreshRecordV1 | undefined> {
    return Promise.resolve(this.#refreshes.get(scopedKey(tenantScope, refreshId)));
  }

  public findOpenRefresh(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<RefreshRecordV1 | undefined> {
    for (const record of this.#refreshes.values()) {
      if (
        tenantScopeKeyV1(record.tenantScope) === tenantScopeKeyV1(tenantScope) &&
        record.dashboardId === dashboardId &&
        openState(record.state)
      ) {
        return Promise.resolve(record);
      }
    }
    return Promise.resolve(undefined);
  }

  public findByIdempotency(input: {
    readonly tenantScope: TenantScopeV1;
    readonly sourceEventId?: string;
    readonly clientRequestId?: string;
    readonly folderReplayKey?: string;
  }): Promise<RefreshRecordV1 | undefined> {
    const candidates = [
      input.sourceEventId === undefined
        ? undefined
        : this.#bySourceEvent.get(
            idempotencyKey(input.tenantScope, 'SOURCE_EVENT', input.sourceEventId),
          ),
      input.clientRequestId === undefined
        ? undefined
        : this.#byClientRequest.get(
            idempotencyKey(input.tenantScope, 'CLIENT_REQUEST', input.clientRequestId),
          ),
      input.folderReplayKey === undefined
        ? undefined
        : this.#byFolderReplay.get(
            idempotencyKey(input.tenantScope, 'FOLDER_REPLAY', input.folderReplayKey),
          ),
    ];
    const refreshId = candidates.find((value): value is string => value !== undefined);
    if (refreshId === undefined) return Promise.resolve(undefined);
    const record = this.#refreshes.get(scopedKey(input.tenantScope, refreshId));
    if (record === undefined) return Promise.reject(new Error('DDA_REFRESH_IDEMPOTENCY_CORRUPT'));
    return Promise.resolve(record);
  }

  #storeRefresh(record: RefreshRecordV1): void {
    const refreshKey = scopedKey(record.tenantScope, record.refreshId);
    const existing = this.#refreshes.get(refreshKey);
    if (
      existing &&
      (existing.dashboardId !== record.dashboardId ||
        tenantScopeKeyV1(existing.tenantScope) !== tenantScopeKeyV1(record.tenantScope))
    ) {
      throw new Error('DDA_REFRESH_IDENTITY_CONFLICT');
    }
    const candidates = [
      ['SOURCE_EVENT', record.sourceEventIds, this.#bySourceEvent],
      ['CLIENT_REQUEST', record.clientRequestIds, this.#byClientRequest],
      ['FOLDER_REPLAY', record.folderReplayKeys, this.#byFolderReplay],
    ] as const;
    for (const [kind, values, map] of candidates) {
      for (const value of values) {
        const key = idempotencyKey(record.tenantScope, kind, value);
        const previous = map.get(key);
        if (previous !== undefined && previous !== record.refreshId) {
          throw new Error('DDA_REFRESH_IDEMPOTENCY_CONFLICT');
        }
      }
    }
    this.#refreshes.set(refreshKey, Object.freeze({ ...record }));
    for (const [kind, values, map] of candidates) {
      for (const value of values) {
        const key = idempotencyKey(record.tenantScope, kind, value);
        map.set(key, record.refreshId);
      }
    }
  }
}
