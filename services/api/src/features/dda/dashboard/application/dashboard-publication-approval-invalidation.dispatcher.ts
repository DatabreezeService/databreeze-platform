import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { DashboardPublicationApprovalInvalidationExecutorPortV1 } from './dashboard-publication-approval-invalidation.port.js';
import type {
  DashboardPublicationApprovalInvalidationOutboxPortV1,
  DashboardPublicationApprovalInvalidationOutboxRecordV1,
} from './dashboard-publication-approval-invalidation-outbox.port.js';

export type DashboardPublicationApprovalInvalidationDispatchResultV1 =
  | { readonly accepted: true; readonly outcome: 'IDLE' | 'COMPLETED' | 'RETRY_SCHEDULED' }
  | { readonly accepted: false; readonly code: 'UNAVAILABLE' | 'LEASE_CONFLICT' };

/**
 * DDA-025/AUD-003: consumes only committed, tenant-scoped publication commands.
 * The JRA call is deliberately outside the publication CAS transaction; retries
 * are safe because the JRA operation targets the same prior subject/version.
 */
export class DashboardPublicationApprovalInvalidationDispatcherV1 {
  public constructor(
    private readonly outbox: DashboardPublicationApprovalInvalidationOutboxPortV1,
    private readonly executor: DashboardPublicationApprovalInvalidationExecutorPortV1,
  ) {}

  public async dispatchNext(input: {
    readonly tenantScope: TenantScopeV1;
    readonly workerId: string;
    readonly now: Date;
    readonly leaseDurationMs: number;
    readonly retryDelayMs: number;
  }): Promise<DashboardPublicationApprovalInvalidationDispatchResultV1> {
    const claimed = await this.outbox.claimNext(input);
    if (!claimed.accepted) return claimed;
    if (claimed.record === undefined) return { accepted: true, outcome: 'IDLE' };

    const record = claimed.record;
    try {
      const invalidated = await this.executor.invalidatePublicationApproval({
        tenantScope: record.tenantScope,
        dashboardId: record.dashboardId,
        priorPublishedVersionId: record.priorPublishedVersionId,
      });
      if (!invalidated.accepted) {
        return this.scheduleRetry(input, record, invalidated.code);
      }
      const completed = await this.outbox.markCompleted({
        tenantScope: input.tenantScope,
        recordId: record.id,
        workerId: input.workerId,
        now: input.now,
      });
      if (!completed.accepted) {
        return completed.code === 'UNAVAILABLE'
          ? { accepted: false, code: 'UNAVAILABLE' }
          : { accepted: false, code: 'LEASE_CONFLICT' };
      }
      return { accepted: true, outcome: 'COMPLETED' };
    } catch (error) {
      return this.scheduleRetry(
        input,
        record,
        error instanceof Error ? error.message : 'DDA_PUBLICATION_INVALIDATION_FAILED',
      );
    }
  }

  private async scheduleRetry(
    input: {
      readonly tenantScope: TenantScopeV1;
      readonly workerId: string;
      readonly now: Date;
      readonly retryDelayMs: number;
    },
    record: DashboardPublicationApprovalInvalidationOutboxRecordV1,
    error: string,
  ): Promise<DashboardPublicationApprovalInvalidationDispatchResultV1> {
    const retryAt = new Date(input.now.getTime() + Math.max(0, input.retryDelayMs));
    const failed = await this.outbox.markFailed({
      tenantScope: input.tenantScope,
      recordId: record.id,
      workerId: input.workerId,
      now: input.now,
      retryAt,
      error: error.slice(0, 512),
    });
    if (!failed.accepted) {
      return failed.code === 'UNAVAILABLE'
        ? { accepted: false, code: 'UNAVAILABLE' }
        : { accepted: false, code: 'LEASE_CONFLICT' };
    }
    return { accepted: true, outcome: 'RETRY_SCHEDULED' };
  }
}
