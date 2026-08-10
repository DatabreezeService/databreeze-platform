import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { RefreshCoordinatorPortV1 } from './refresh-coordinator.port.js';

export type DashboardFreshnessPolicyV1 = 'ON_CHANGE' | 'MANUAL' | 'SCHEDULED';

/** API freshness surface uses CURRENT for an authorized up-to-date snapshot (DDA-033). */
export type DashboardFreshnessStateV1 =
  | 'CURRENT'
  | 'PENDING'
  | 'STALE'
  | 'BLOCKED'
  | 'SOURCE_UNAVAILABLE';

export interface FreshnessViewV1 {
  readonly dashboardId: string;
  readonly freshnessPolicy: DashboardFreshnessPolicyV1;
  readonly freshnessState: DashboardFreshnessStateV1;
  readonly lastSuccessfulRefreshAt?: string;
  readonly inputSelectorHash?: string;
  readonly dashboardVersionId?: string;
  readonly permissionProjectionVersionId?: string;
  readonly pendingDurationMs?: number;
  readonly reasonCode?: string;
  readonly lastGoodSnapshotId?: string;
  readonly resultCompleteness: 'COMPLETE' | 'SAMPLED' | 'TRUNCATED' | 'UNKNOWN';
  readonly samplingState: 'NONE' | 'SAMPLED';
  readonly truncationState: 'NONE' | 'TRUNCATED';
}

export type FreshnessResultV1 =
  | { readonly accepted: true; readonly value: FreshnessViewV1 }
  | { readonly accepted: false; readonly code: 'PERMISSION_REVOKED' | 'DASHBOARD_NOT_FOUND' };

interface SourceConditionV1 {
  readonly kind: 'STALE' | 'BLOCKED' | 'SOURCE_UNAVAILABLE';
  readonly reasonCode: string;
}

/** DDA-027/DDA-033: authorized freshness projection over last-good snapshots. */
export class FreshnessService {
  readonly #conditions = new Map<string, SourceConditionV1>();
  readonly #pendingSince = new Map<string, number>();
  readonly #policies = new Map<string, DashboardFreshnessPolicyV1>();

  public constructor(private readonly coordinator: RefreshCoordinatorPortV1) {}

  public setFreshnessPolicy(dashboardId: string, policy: DashboardFreshnessPolicyV1): void {
    this.#policies.set(dashboardId, policy);
  }

  public markSourceCondition(dashboardId: string, condition: SourceConditionV1): Promise<void> {
    this.#conditions.set(dashboardId, Object.freeze({ ...condition }));
    this.#pendingSince.delete(dashboardId);
  }

  public markPending(dashboardId: string, pendingSinceMs: number): Promise<void> {
    this.#conditions.delete(dashboardId);
    this.#pendingSince.set(dashboardId, pendingSinceMs);
  }

  public async getFreshness(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly authorizedPermissionProjectionVersionId: string;
    readonly nowMs: number;
  }): Promise<FreshnessResultV1> {
    const snapshot = await this.coordinator.getCurrentSnapshot(input.dashboardId);
    if (!snapshot) {
      return Object.freeze({ accepted: false, code: 'DASHBOARD_NOT_FOUND' });
    }
    if (snapshot.permissionProjectionVersionId !== input.authorizedPermissionProjectionVersionId) {
      return Object.freeze({ accepted: false, code: 'PERMISSION_REVOKED' });
    }

    const policy = this.#policies.get(input.dashboardId) ?? 'ON_CHANGE';
    const condition = this.#conditions.get(input.dashboardId);
    const pendingSince = this.#pendingSince.get(input.dashboardId);

    let freshnessState: DashboardFreshnessStateV1 = 'CURRENT';
    let reasonCode: string | undefined;
    let pendingDurationMs: number | undefined;

    if (condition) {
      freshnessState = condition.kind;
      reasonCode = condition.reasonCode;
    } else if (pendingSince !== undefined) {
      freshnessState = 'PENDING';
      pendingDurationMs = Math.max(0, input.nowMs - pendingSince);
      reasonCode = 'REFRESH_IN_FLIGHT';
    }

    const value: FreshnessViewV1 = {
      dashboardId: input.dashboardId,
      freshnessPolicy: policy,
      freshnessState,
      lastSuccessfulRefreshAt: snapshot.createdAt,
      inputSelectorHash: snapshot.inputSelectorHash,
      dashboardVersionId: snapshot.dashboardVersionId,
      permissionProjectionVersionId: snapshot.permissionProjectionVersionId,
      lastGoodSnapshotId: snapshot.snapshotId,
      resultCompleteness: 'COMPLETE',
      samplingState: 'NONE',
      truncationState: 'NONE',
    };
    if (pendingDurationMs !== undefined) {
      (value as { pendingDurationMs?: number }).pendingDurationMs = pendingDurationMs;
    }
    if (reasonCode !== undefined) {
      (value as { reasonCode?: string }).reasonCode = reasonCode;
    }
    return Object.freeze({
      accepted: true,
      value: Object.freeze(value),
    });
  }
}
