import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export type DashboardPublicationApprovalInvalidationOutboxStateV1 =
  | 'PENDING'
  | 'CLAIMED'
  | 'FAILED'
  | 'COMPLETED';

export interface DashboardPublicationApprovalInvalidationOutboxRecordV1 {
  readonly id: string;
  readonly keyValue: string;
  readonly snapshotId: string;
  readonly dashboardId: string;
  readonly priorPublishedVersionId: string;
  readonly tenantScope: TenantScopeV1;
  readonly action: 'INVALIDATE_DASHBOARD_VERSION_PUBLICATION_APPROVALS';
  readonly state: DashboardPublicationApprovalInvalidationOutboxStateV1;
  readonly attempts: number;
  readonly leaseOwner?: string | undefined;
  readonly leaseExpiresAt?: string | undefined;
  readonly nextAttemptAt?: string | undefined;
  readonly lastError?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly createdAt: string;
}

export type DashboardPublicationApprovalInvalidationOutboxOperationResultV1 =
  | { readonly accepted: true }
  | {
      readonly accepted: false;
      readonly code: 'NOT_FOUND' | 'LEASE_CONFLICT' | 'UNAVAILABLE';
    };

export interface DashboardPublicationApprovalInvalidationOutboxPortV1 {
  listPendingTenantScopes(input: {
    readonly now: Date;
    readonly limit: number;
  }): Promise<readonly TenantScopeV1[]>;
  claimNext(input: {
    readonly tenantScope: TenantScopeV1;
    readonly workerId: string;
    readonly now: Date;
    readonly leaseDurationMs: number;
  }): Promise<
    | {
        readonly accepted: true;
        readonly record?: DashboardPublicationApprovalInvalidationOutboxRecordV1 | undefined;
      }
    | { readonly accepted: false; readonly code: 'UNAVAILABLE' }
  >;
  markCompleted(input: {
    readonly tenantScope: TenantScopeV1;
    readonly recordId: string;
    readonly workerId: string;
    readonly now: Date;
  }): Promise<DashboardPublicationApprovalInvalidationOutboxOperationResultV1>;
  markFailed(input: {
    readonly tenantScope: TenantScopeV1;
    readonly recordId: string;
    readonly workerId: string;
    readonly now: Date;
    readonly retryAt: Date;
    readonly error: string;
  }): Promise<DashboardPublicationApprovalInvalidationOutboxOperationResultV1>;
}
