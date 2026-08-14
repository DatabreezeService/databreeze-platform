import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';
import { tenantScopeKeyV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { RefreshRepositoryPortV1 } from '../../application/refresh-repository.port.js';
import type {
  RefreshCoordinatorPortV1,
  RefreshLifecycleTransitionInputV1,
  RefreshRecordV1,
  RefreshTriggerReservationInputV1,
  RefreshTriggerReservationResultV1,
} from '../application/refresh-coordinator.port.js';
import {
  createCommittedSnapshotRefreshEventV1,
  type RefreshEventAppendInputV1,
} from '../application/refresh-event-bus.js';
import type { RefreshCommitOutboxPortV1 } from '../application/refresh-commit-outbox.port.js';
import {
  readDashboardSnapshotBindingProofV1,
  validateDashboardSnapshotBindingProofV1,
} from '../../dashboard/application/dashboard-repository.port.js';
import { InMemoryRefreshCoordinatorAdapter } from './in-memory-refresh-coordinator.adapter.js';

function sameScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  return tenantScopeKeyV1(left) === tenantScopeKeyV1(right);
}

/** DDA-036: durable refresh orchestration with a scoped restart cache. */
export class DurableRefreshCoordinatorAdapter implements RefreshCoordinatorPortV1 {
  readonly #memory: InMemoryRefreshCoordinatorAdapter;
  readonly #repository: RefreshRepositoryPortV1;
  readonly #commitOutbox: RefreshCommitOutboxPortV1 | undefined;

  public constructor(
    repository: RefreshRepositoryPortV1,
    commitOutbox?: RefreshCommitOutboxPortV1,
  ) {
    this.#memory = new InMemoryRefreshCoordinatorAdapter();
    this.#repository = repository;
    this.#commitOutbox = commitOutbox;
  }

  public async getCurrentSnapshot(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardSnapshotV1 | undefined> {
    const cached = await this.#memory.getCurrentSnapshot(tenantScope, dashboardId);
    if (cached) return cached;
    // Restart recovery is deliberately state/snapshot based; open executions are not a source
    // of truth for the last committed dashboard snapshot.
    const latest = await this.#repository.findLatestSnapshotForDashboard(tenantScope, dashboardId);
    if (latest) {
      await this.#memory.setCurrentSnapshot(tenantScope, dashboardId, latest);
    }
    return latest;
  }

  public async setCurrentSnapshot(
    tenantScope: TenantScopeV1,
    dashboardId: string,
    snapshot: DashboardSnapshotV1,
  ): Promise<void> {
    const bindingProof = readDashboardSnapshotBindingProofV1(snapshot);
    if (bindingProof === undefined) throw new Error('DDA_SNAPSHOT_BINDING_PROOF_REQUIRED');
    if (validateDashboardSnapshotBindingProofV1({ snapshot, bindingProof }) === undefined) {
      throw new Error('DDA_SNAPSHOT_BINDING_PROOF_INVALID');
    }
    if (!sameScope(tenantScope, snapshot.tenantScope)) {
      throw new Error('DDA_REFRESH_SCOPE_MISMATCH');
    }
    await this.#repository.saveSnapshot(snapshot);
    await this.#repository.saveState({
      dashboardId,
      tenantScope,
      freshnessPolicy: 'ON_CHANGE',
      lastSnapshotId: snapshot.snapshotId,
      status: 'CURRENT',
    });
    await this.#memory.setCurrentSnapshot(tenantScope, dashboardId, snapshot);
  }

  public async commitSnapshotAtomically(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly refreshId: string;
    readonly expectedRevision: number;
    readonly expectedLeaseId: string;
    readonly expectedInputSelectorHash: string;
    readonly snapshot: DashboardSnapshotV1;
    readonly event?: RefreshEventAppendInputV1;
  }): Promise<void> {
    const tenantScope = input.tenantScope;
    if (!sameScope(tenantScope, input.snapshot.tenantScope)) {
      throw new Error('DDA_REFRESH_SCOPE_MISMATCH');
    }
    const bindingProof = readDashboardSnapshotBindingProofV1(input.snapshot);
    if (bindingProof === undefined) throw new Error('DDA_SNAPSHOT_BINDING_PROOF_REQUIRED');
    if (
      validateDashboardSnapshotBindingProofV1({ snapshot: input.snapshot, bindingProof }) ===
      undefined
    ) {
      throw new Error('DDA_SNAPSHOT_BINDING_PROOF_INVALID');
    }
    if (this.#commitOutbox !== undefined) {
      const event =
        input.event ??
        createCommittedSnapshotRefreshEventV1({
          dashboardId: input.dashboardId,
          refreshId: input.refreshId,
          snapshot: {
            tenantScope: input.snapshot.tenantScope,
            dashboardVersionId: input.snapshot.dashboardVersionId,
            snapshotId: input.snapshot.snapshotId,
            freshnessState: input.snapshot.freshnessState,
            eventHash: input.snapshot.canonicalHash,
            occurredAt: input.snapshot.createdAt,
            inputSelectorHash: input.snapshot.inputSelectorHash,
          },
        });
      await this.#commitOutbox.commitSnapshotAndEvent({ ...input, tenantScope, event });
      await this.#memory.setCurrentSnapshot(tenantScope, input.dashboardId, input.snapshot);
      return;
    }

    // The in-memory/dev path still performs the same lifecycle checks. Production composition
    // supplies the durable outbox implementation above.
    await this.#memory.commitSnapshotAtomically({ ...input, tenantScope });
    await this.#repository.saveSnapshot(input.snapshot);
    await this.#repository.saveState({
      dashboardId: input.dashboardId,
      tenantScope,
      freshnessPolicy: 'ON_CHANGE',
      lastSnapshotId: input.snapshot.snapshotId,
      lastJobId: input.refreshId,
      status: 'COMMITTED',
    });
    const refresh = await this.#memory.findRefresh(tenantScope, input.refreshId);
    if (refresh) {
      await this.#repository.transitionRefresh({
        tenantScope,
        refreshId: input.refreshId,
        dashboardId: input.dashboardId,
        expectedRevision: input.expectedRevision,
        expectedState: 'VERIFYING',
        expectedLeaseId: input.expectedLeaseId,
        nextState: 'COMMITTED',
        updatedAtMs: refresh.updatedAtMs,
      });
    }
  }

  public async reserveRefreshTrigger(
    input: RefreshTriggerReservationInputV1,
  ): Promise<RefreshTriggerReservationResultV1> {
    const result = await this.#repository.reserveRefreshTrigger(input);
    await this.#memory.saveRefresh(result.record);
    return result;
  }

  public async saveRefresh(record: RefreshRecordV1): Promise<void> {
    await this.#repository.saveRefresh(record);
    await this.#memory.saveRefresh(record);
  }

  public async transitionRefresh(
    input: RefreshLifecycleTransitionInputV1,
  ): Promise<RefreshRecordV1> {
    const durable = await this.#repository.transitionRefresh(input);
    await this.#memory.saveRefresh(durable);
    return durable;
  }

  public async findRefresh(
    tenantScope: TenantScopeV1,
    refreshId: string,
  ): Promise<RefreshRecordV1 | undefined> {
    const durable = await this.#repository.findRefresh(tenantScope, refreshId);
    if (durable) {
      await this.#memory.saveRefresh(durable);
      return durable;
    }
    return this.#memory.findRefresh(tenantScope, refreshId);
  }

  public async findOpenRefresh(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<RefreshRecordV1 | undefined> {
    const durable = await this.#repository.findOpenRefresh(tenantScope, dashboardId);
    if (durable) {
      await this.#memory.saveRefresh(durable);
      return durable;
    }
    return this.#memory.findOpenRefresh(tenantScope, dashboardId);
  }

  public async findByIdempotency(input: {
    readonly tenantScope: TenantScopeV1;
    readonly sourceEventId?: string;
    readonly clientRequestId?: string;
    readonly folderReplayKey?: string;
  }): Promise<RefreshRecordV1 | undefined> {
    const durable = await this.#repository.findByIdempotency(input);
    if (durable) {
      await this.#memory.saveRefresh(durable);
      return durable;
    }
    return this.#memory.findByIdempotency(input);
  }
}
