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
    const reservation = await this.coordinator.reserveRefreshTrigger({
      tenantScope: trigger.tenantScope,
      sourceEventId: trigger.sourceEventId,
      dashboardId: trigger.dashboardId,
      dashboardVersionId: trigger.dashboardVersionId,
      permissionProjectionVersionId: trigger.permissionProjectionVersionId,
      datasetVersionId: trigger.datasetVersionId,
      definitionIds: trigger.definitionIds,
      inputSelectorHash: trigger.inputSelectorHash,
      debounceWindowMs: trigger.debounceWindowMs,
      occurredAtMs: trigger.occurredAtMs,
      clientRequestId: trigger.clientRequestId,
      folderReplayKey: trigger.folderReplayKey,
    });
    return Object.freeze({
      accepted: true,
      value: toAcceptance(reservation.record, {
        idempotentReplay: reservation.idempotentReplay,
        coalesced: reservation.coalesced,
      }),
    });
  }

  public async markRunning(
    tenantScope: TenantScopeV1,
    refreshId: string,
    leaseId: string,
  ): Promise<RefreshOrchestratorResultV1> {
    const refresh = await this.coordinator.findRefresh(tenantScope, refreshId);
    if (!refresh) return Object.freeze({ accepted: false, code: 'REFRESH_NOT_FOUND' });
    const running = await this.coordinator.transitionRefresh({
      tenantScope,
      refreshId,
      dashboardId: refresh.dashboardId,
      expectedRevision: refresh.revision,
      expectedState: refresh.state,
      ...(refresh.leaseId === undefined ? {} : { expectedLeaseId: refresh.leaseId }),
      nextState: 'RUNNING',
      nextLeaseId: leaseId,
      updatedAtMs: refresh.updatedAtMs + 1,
    });
    return Object.freeze({
      accepted: true,
      value: toAcceptance(running, { idempotentReplay: false, coalesced: false }),
    });
  }

  public async handleLeaseExpiry(
    tenantScope: TenantScopeV1,
    refreshId: string,
    leaseId: string,
  ): Promise<RefreshOrchestratorResultV1> {
    const refresh = await this.coordinator.findRefresh(tenantScope, refreshId);
    if (!refresh) return Object.freeze({ accepted: false, code: 'REFRESH_NOT_FOUND' });
    if (refresh.leaseId !== leaseId) {
      return Object.freeze({ accepted: false, code: 'LEASE_MISMATCH' });
    }
    const pending = await this.coordinator.transitionRefresh({
      tenantScope,
      refreshId,
      dashboardId: refresh.dashboardId,
      expectedRevision: refresh.revision,
      expectedState: refresh.state,
      expectedLeaseId: leaseId,
      nextState: 'PENDING',
      updatedAtMs: refresh.updatedAtMs + 1,
    });
    return Object.freeze({
      accepted: true,
      value: toAcceptance(pending, { idempotentReplay: false, coalesced: false }),
    });
  }

  public async recoverAfterCrash(
    tenantScope: TenantScopeV1,
    refreshId: string,
    checkpoint: 'AFTER_JOB_DISPATCH' | 'AFTER_RESULT_VERIFICATION' | 'DURING_SNAPSHOT_COMMIT',
    leaseId?: string,
  ): Promise<RefreshOrchestratorResultV1> {
    const refresh = await this.coordinator.findRefresh(tenantScope, refreshId);
    if (!refresh) return Object.freeze({ accepted: false, code: 'REFRESH_NOT_FOUND' });

    const nextState: RefreshLifecycleStateV1 =
      checkpoint === 'AFTER_JOB_DISPATCH'
        ? 'RUNNING'
        : checkpoint === 'AFTER_RESULT_VERIFICATION'
          ? 'VERIFYING'
          : 'FAILED';

    const nextLeaseId =
      nextState === 'RUNNING' || nextState === 'VERIFYING'
        ? (leaseId ?? refresh.leaseId)
        : undefined;
    if ((nextState === 'RUNNING' || nextState === 'VERIFYING') && nextLeaseId === undefined) {
      return Object.freeze({ accepted: false, code: 'REFRESH_LEASE_REQUIRED' });
    }
    const recovered = await this.coordinator.transitionRefresh({
      tenantScope,
      refreshId,
      dashboardId: refresh.dashboardId,
      expectedRevision: refresh.revision,
      expectedState: refresh.state,
      ...(refresh.leaseId === undefined ? {} : { expectedLeaseId: refresh.leaseId }),
      nextState,
      ...(nextLeaseId === undefined ? {} : { nextLeaseId }),
      updatedAtMs: refresh.updatedAtMs + 1,
    });
    return Object.freeze({
      accepted: true,
      value: toAcceptance(recovered, { idempotentReplay: false, coalesced: false }),
    });
  }
}
