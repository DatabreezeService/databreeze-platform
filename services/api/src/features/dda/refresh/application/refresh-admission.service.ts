import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { RefreshCoordinatorPortV1 } from './refresh-coordinator.port.js';
import type {
  RefreshUsageClassV1,
  RefreshUsagePortV1,
  RefreshUsageScopeLevelV1,
} from './refresh-usage.port.js';

export type RefreshAdmissionResultV1 =
  | {
      readonly accepted: true;
      readonly value: { readonly reservationId: string };
    }
  | {
      readonly accepted: false;
      readonly code: 'USAGE_LIMIT_EXCEEDED' | 'USAGE_AUTHORITY_UNAVAILABLE';
      readonly remediationCode: 'REDUCE_OR_UPGRADE_USAGE' | 'RETRY_WHEN_USAGE_AVAILABLE';
      readonly safeMessage: string;
    };

/** DDA-036: fail-closed refresh admission that never publishes a partial snapshot. */
export class RefreshAdmissionService {
  public constructor(
    private readonly coordinator: RefreshCoordinatorPortV1,
    private readonly usage: RefreshUsagePortV1,
  ) {}

  public async admit(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly refreshId: string;
    readonly correlationId: string;
    readonly reservationKey: string;
    readonly scopeLevel: RefreshUsageScopeLevelV1;
    readonly usageClasses: readonly RefreshUsageClassV1[];
  }): Promise<RefreshAdmissionResultV1> {
    void input.tenantScope;
    // Preserve last-good by never mutating snapshot pointer on deny paths.
    const lastGood = await this.coordinator.getCurrentSnapshot(input.dashboardId);
    void lastGood;

    for (const usageClass of input.usageClasses) {
      let decision: { readonly admitted: boolean; readonly reasonCode?: string };
      try {
        decision = await this.usage.evaluate({
          usageClass,
          scopeLevel: input.scopeLevel,
        });
      } catch {
        await this.usage.emitContentSafeOutcome({
          action: 'DASHBOARD_REFRESH_ADMISSION',
          outcome: 'DENIED',
          correlationId: input.correlationId,
          references: [input.dashboardId, input.refreshId],
        });
        return Object.freeze({
          accepted: false,
          code: 'USAGE_AUTHORITY_UNAVAILABLE',
          remediationCode: 'RETRY_WHEN_USAGE_AVAILABLE',
          safeMessage: 'Usage admission is temporarily unavailable. Retry later.',
        });
      }

      if (!decision.admitted) {
        await this.usage.emitContentSafeOutcome({
          action: 'DASHBOARD_REFRESH_ADMISSION',
          outcome: 'DENIED',
          correlationId: input.correlationId,
          references: [input.dashboardId, input.refreshId],
        });
        const code =
          decision.reasonCode === 'USAGE_AUTHORITY_UNAVAILABLE'
            ? 'USAGE_AUTHORITY_UNAVAILABLE'
            : 'USAGE_LIMIT_EXCEEDED';
        return Object.freeze({
          accepted: false,
          code,
          remediationCode:
            code === 'USAGE_AUTHORITY_UNAVAILABLE'
              ? 'RETRY_WHEN_USAGE_AVAILABLE'
              : 'REDUCE_OR_UPGRADE_USAGE',
          safeMessage:
            code === 'USAGE_AUTHORITY_UNAVAILABLE'
              ? 'Usage admission is temporarily unavailable. Retry later.'
              : 'Refresh exceeds an allowed usage limit. Reduce load or upgrade capacity.',
        });
      }
    }

    // Reserve against the primary materialization class for idempotent paid-resource holds.
    const primaryClass = input.usageClasses.includes('MATERIALIZATION')
      ? 'MATERIALIZATION'
      : input.usageClasses[0]!;
    const reserved = await this.usage.reserve({
      reservationKey: input.reservationKey,
      usageClass: primaryClass,
    });

    await this.usage.emitContentSafeOutcome({
      action: 'DASHBOARD_REFRESH_ADMISSION',
      outcome: 'ADMITTED',
      correlationId: input.correlationId,
      references: [input.dashboardId, input.refreshId],
    });

    return Object.freeze({
      accepted: true,
      value: Object.freeze({ reservationId: reserved.reservationId }),
    });
  }

  public async finalize(reservationId: string): Promise<void> {
    await this.usage.finalize(reservationId);
  }

  public async release(reservationId: string): Promise<void> {
    await this.usage.release(reservationId);
  }
}
