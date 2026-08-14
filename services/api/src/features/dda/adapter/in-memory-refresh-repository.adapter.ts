import { randomUUID } from 'node:crypto';

import { tenantScopeKeyV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type {
  DashboardSnapshotV1,
  DdaRefreshEventV1,
} from '@databreeze/domain/data-to-dashboard/v1';

import type {
  DdaRefreshStateV1,
  RefreshEventCorrelationV1,
  RefreshRepositoryPortV1,
} from '../application/refresh-repository.port.js';
import type {
  RefreshRecordV1,
  RefreshLifecycleTransitionInputV1,
  RefreshTriggerReservationInputV1,
  RefreshTriggerReservationResultV1,
} from '../refresh/application/refresh-coordinator.port.js';
import {
  readDashboardSnapshotBindingProofV1,
  validateDashboardSnapshotBindingProofV1,
} from '../dashboard/application/dashboard-repository.port.js';

function scopeKey(tenantScope: TenantScopeV1, id: string): string {
  if (tenantScope.scopeType !== 'project' || !tenantScope.workspaceId || !tenantScope.projectId) {
    throw new Error('TENANT_SCOPE_REQUIRED');
  }
  return `${tenantScopeKeyV1(tenantScope)}|${id}`;
}

function key(
  tenantScope: TenantScopeV1,
  kind: 'SOURCE_EVENT' | 'CLIENT_REQUEST' | 'FOLDER_REPLAY',
  value: string,
): string {
  return `${scopeKey(tenantScope, kind)}|${value}`;
}

function openState(state: RefreshRecordV1['state']): boolean {
  return state === 'PENDING' || state === 'RUNNING' || state === 'VERIFYING';
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

function appendUnique(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : Object.freeze([...values, value]);
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
      const bindingProof = readDashboardSnapshotBindingProofV1(snapshot);
      if (bindingProof === undefined) throw new Error('DDA_SNAPSHOT_BINDING_PROOF_REQUIRED');
      if (validateDashboardSnapshotBindingProofV1({ snapshot, bindingProof }) === undefined) {
        throw new Error('DDA_SNAPSHOT_BINDING_PROOF_INVALID');
      }
      const snapshotKey = scopeKey(snapshot.tenantScope, snapshot.snapshotId);
      const existing = this.#snapshots.get(snapshotKey);
      if (existing && JSON.stringify(existing) !== JSON.stringify(snapshot)) {
        return Promise.reject(new Error('DDA_IMMUTABLE_SNAPSHOT_CONFLICT'));
      }
      this.#snapshots.set(snapshotKey, snapshot);
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
      scopeKey(event.tenantScope, event.dashboardId);
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

  public async reserveRefreshTrigger(
    input: RefreshTriggerReservationInputV1,
  ): Promise<RefreshTriggerReservationResultV1> {
    const candidates = [
      ['SOURCE_EVENT', input.sourceEventId, this.#bySourceEvent] as const,
      ['CLIENT_REQUEST', input.clientRequestId, this.#byClientRequest] as const,
      ['FOLDER_REPLAY', input.folderReplayKey, this.#byFolderReplay] as const,
    ];
    for (const [kind, value, map] of candidates) {
      const refreshId = map.get(key(input.tenantScope, kind, value));
      if (refreshId !== undefined) {
        const existing = this.#refreshes.get(scopeKey(input.tenantScope, refreshId));
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

    const created: RefreshRecordV1 = Object.freeze({
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
      state: 'PENDING',
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
      const refreshKey = scopeKey(record.tenantScope, record.refreshId);
      const existing = this.#refreshes.get(refreshKey);
      if (
        existing &&
        (existing.dashboardId !== record.dashboardId ||
          tenantScopeKeyV1(existing.tenantScope) !== tenantScopeKeyV1(record.tenantScope))
      ) {
        throw new Error('DDA_REFRESH_IDENTITY_CONFLICT');
      }
      if (existing !== undefined) throw new Error('DDA_REFRESH_TRANSITION_REQUIRED');
      this.#storeRefresh(record);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public transitionRefresh(input: RefreshLifecycleTransitionInputV1): Promise<RefreshRecordV1> {
    try {
      if (
        (input.nextState === 'RUNNING' || input.nextState === 'VERIFYING') &&
        input.nextLeaseId === undefined
      ) {
        return Promise.reject(new Error('DDA_REFRESH_LEASE_REQUIRED'));
      }
      const existing = this.#refreshes.get(scopeKey(input.tenantScope, input.refreshId));
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
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #storeRefresh(record: RefreshRecordV1): void {
    const refreshKey = scopeKey(record.tenantScope, record.refreshId);
    const existing = this.#refreshes.get(refreshKey);
    if (
      existing &&
      (existing.dashboardId !== record.dashboardId ||
        tenantScopeKeyV1(existing.tenantScope) !== tenantScopeKeyV1(record.tenantScope))
    ) {
      throw new Error('DDA_REFRESH_IDENTITY_CONFLICT');
    }
    const candidates = [
      ['SOURCE_EVENT', record.sourceEventIds, this.#bySourceEvent] as const,
      ['CLIENT_REQUEST', record.clientRequestIds, this.#byClientRequest] as const,
      ['FOLDER_REPLAY', record.folderReplayKeys, this.#byFolderReplay] as const,
    ];
    for (const [kind, values, map] of candidates) {
      for (const value of values) {
        const existingRefreshId = map.get(key(record.tenantScope, kind, value));
        if (existingRefreshId !== undefined && existingRefreshId !== record.refreshId) {
          throw new Error('DDA_REFRESH_IDEMPOTENCY_CONFLICT');
        }
      }
    }
    this.#refreshes.set(refreshKey, Object.freeze({ ...record }));
    for (const [kind, values, map] of candidates) {
      for (const value of values) map.set(key(record.tenantScope, kind, value), record.refreshId);
    }
  }

  public findRefresh(
    tenantScope: TenantScopeV1,
    refreshId: string,
  ): Promise<RefreshRecordV1 | undefined> {
    return Promise.resolve(this.#refreshes.get(scopeKey(tenantScope, refreshId)));
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
        : this.#bySourceEvent.get(key(input.tenantScope, 'SOURCE_EVENT', input.sourceEventId)),
      input.clientRequestId === undefined
        ? undefined
        : this.#byClientRequest.get(
            key(input.tenantScope, 'CLIENT_REQUEST', input.clientRequestId),
          ),
      input.folderReplayKey === undefined
        ? undefined
        : this.#byFolderReplay.get(key(input.tenantScope, 'FOLDER_REPLAY', input.folderReplayKey)),
    ];
    const refreshId = candidates.find((value): value is string => value !== undefined);
    if (refreshId === undefined) return Promise.resolve(undefined);
    const record = this.#refreshes.get(scopeKey(input.tenantScope, refreshId));
    if (record === undefined) return Promise.reject(new Error('DDA_REFRESH_IDEMPOTENCY_CORRUPT'));
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
