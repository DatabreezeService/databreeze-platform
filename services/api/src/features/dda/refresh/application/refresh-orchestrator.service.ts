import { randomUUID } from 'node:crypto';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  RefreshCoordinatorPortV1,
  RefreshLifecycleStateV1,
  RefreshRecordV1,
} from './refresh-coordinator.port.js';
import type { SnapshotCommitService } from './snapshot-commit.service.js';

export interface RefreshTriggerV1 {
  readonly sourceEventId: string;
  readonly tenantScope: TenantScopeV1;
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
  readonly workerAttempt?: number;
}

export interface RefreshAcceptanceV1 {
  readonly refreshId: string;
  readonly state: RefreshLifecycleStateV1;
  readonly inputSelectorHash: string;
  readonly sourceEventIds: readonly string[];
  readonly idempotentReplay: boolean;
  readonly coalesced: boolean;
}

export type RefreshOrchestratorResultV1 =
  | { readonly accepted: true; readonly value: RefreshAcceptanceV1 }
  | { readonly accepted: false; readonly code: string };

function compatible(left: RefreshRecordV1, trigger: RefreshTriggerV1): boolean {
  return (
    left.dashboardVersionId === trigger.dashboardVersionId &&
    left.permissionProjectionVersionId === trigger.permissionProjectionVersionId &&
    left.datasetVersionId === trigger.datasetVersionId &&
    left.definitionIds.length === trigger.definitionIds.length &&
    left.definitionIds.every((id, index) => id === trigger.definitionIds[index])
  );
}

function toAcceptance(
  record: RefreshRecordV1,
  flags: { readonly idempotentReplay: boolean; readonly coalesced: boolean },
): RefreshAcceptanceV1 {
  return Object.freeze({
    refreshId: record.refreshId,
    state: record.state,
    inputSelectorHash: record.inputSelectorHash,
    sourceEventIds: record.sourceEventIds,
    idempotentReplay: flags.idempotentReplay,
    coalesced: flags.coalesced,
  });
}

/** DDA-030: coalesce compatible refreshes and recover explicit lifecycle states. */
export class RefreshOrchestratorService {
  public constructor(
    private readonly coordinator: RefreshCoordinatorPortV1,
    private readonly snapshotCommit: SnapshotCommitService,
  ) {
    void this.snapshotCommit;
  }

  public async acceptTrigger(trigger: RefreshTriggerV1): Promise<RefreshOrchestratorResultV1> {
    const existing = await this.coordinator.findByIdempotency({
      sourceEventId: trigger.sourceEventId,
      clientRequestId: trigger.clientRequestId,
      folderReplayKey: trigger.folderReplayKey,
    });
    if (existing) {
      return Object.freeze({
        accepted: true,
        value: toAcceptance(existing, { idempotentReplay: true, coalesced: false }),
      });
    }

    const open = await this.coordinator.findOpenRefresh(trigger.dashboardId);
    if (
      open &&
      open.state === 'PENDING' &&
      compatible(open, trigger) &&
      trigger.occurredAtMs - open.openedAtMs <= open.debounceWindowMs
    ) {
      const coalesced: RefreshRecordV1 = Object.freeze({
        ...open,
        inputSelectorHash: trigger.inputSelectorHash,
        sourceEventIds: Object.freeze([...open.sourceEventIds, trigger.sourceEventId]),
        clientRequestIds: Object.freeze([...open.clientRequestIds, trigger.clientRequestId]),
        folderReplayKeys: Object.freeze([...open.folderReplayKeys, trigger.folderReplayKey]),
        updatedAtMs: trigger.occurredAtMs,
      });
      await this.coordinator.saveRefresh(coalesced);
      return Object.freeze({
        accepted: true,
        value: toAcceptance(coalesced, { idempotentReplay: false, coalesced: true }),
      });
    }

    if (open && !compatible(open, trigger)) {
      await this.coordinator.saveRefresh(
        Object.freeze({ ...open, state: 'SUPERSEDED', updatedAtMs: trigger.occurredAtMs }),
      );
    }

    const refreshId = randomUUID();
    const created: RefreshRecordV1 = Object.freeze({
      refreshId,
      tenantScope: trigger.tenantScope,
      dashboardId: trigger.dashboardId,
      dashboardVersionId: trigger.dashboardVersionId,
      permissionProjectionVersionId: trigger.permissionProjectionVersionId,
      datasetVersionId: trigger.datasetVersionId,
      definitionIds: Object.freeze([...trigger.definitionIds]),
      inputSelectorHash: trigger.inputSelectorHash,
      sourceEventIds: Object.freeze([trigger.sourceEventId]),
      clientRequestIds: Object.freeze([trigger.clientRequestId]),
      folderReplayKeys: Object.freeze([trigger.folderReplayKey]),
      state: 'PENDING',
      debounceWindowMs: trigger.debounceWindowMs,
      openedAtMs: trigger.occurredAtMs,
      updatedAtMs: trigger.occurredAtMs,
    });
    await this.coordinator.saveRefresh(created);
    return Object.freeze({
      accepted: true,
      value: toAcceptance(created, { idempotentReplay: false, coalesced: false }),
    });
  }

  public async markRunning(
    refreshId: string,
    leaseId: string,
  ): Promise<RefreshOrchestratorResultV1> {
    const refresh = await this.coordinator.findRefresh(refreshId);
    if (!refresh) return Object.freeze({ accepted: false, code: 'REFRESH_NOT_FOUND' });
    const running = Object.freeze({
      ...refresh,
      state: 'RUNNING' as const,
      leaseId,
      updatedAtMs: refresh.updatedAtMs + 1,
    });
    await this.coordinator.saveRefresh(running);
    return Object.freeze({
      accepted: true,
      value: toAcceptance(running, { idempotentReplay: false, coalesced: false }),
    });
  }

  public async handleLeaseExpiry(
    refreshId: string,
    leaseId: string,
  ): Promise<RefreshOrchestratorResultV1> {
    const refresh = await this.coordinator.findRefresh(refreshId);
    if (!refresh) return Object.freeze({ accepted: false, code: 'REFRESH_NOT_FOUND' });
    if (refresh.leaseId !== leaseId) {
      return Object.freeze({ accepted: false, code: 'LEASE_MISMATCH' });
    }
    const { leaseId: _expiredLease, ...rest } = refresh;
    void _expiredLease;
    const pending: RefreshRecordV1 = Object.freeze({
      ...rest,
      state: 'PENDING',
      updatedAtMs: refresh.updatedAtMs + 1,
    });
    await this.coordinator.saveRefresh(pending);
    return Object.freeze({
      accepted: true,
      value: toAcceptance(pending, { idempotentReplay: false, coalesced: false }),
    });
  }

  public async recoverAfterCrash(
    refreshId: string,
    checkpoint: 'AFTER_JOB_DISPATCH' | 'AFTER_RESULT_VERIFICATION' | 'DURING_SNAPSHOT_COMMIT',
  ): Promise<RefreshOrchestratorResultV1> {
    const refresh = await this.coordinator.findRefresh(refreshId);
    if (!refresh) return Object.freeze({ accepted: false, code: 'REFRESH_NOT_FOUND' });

    const nextState: RefreshLifecycleStateV1 =
      checkpoint === 'AFTER_JOB_DISPATCH'
        ? 'RUNNING'
        : checkpoint === 'AFTER_RESULT_VERIFICATION'
          ? 'VERIFYING'
          : 'FAILED';

    const recovered = Object.freeze({
      ...refresh,
      state: nextState,
      updatedAtMs: refresh.updatedAtMs + 1,
    });
    await this.coordinator.saveRefresh(recovered);
    return Object.freeze({
      accepted: true,
      value: toAcceptance(recovered, { idempotentReplay: false, coalesced: false }),
    });
  }
}
