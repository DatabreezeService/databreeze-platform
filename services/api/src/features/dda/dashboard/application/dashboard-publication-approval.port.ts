import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export interface DashboardPublicationApprovalV1 {
  readonly approvalId: string;
  readonly tenantScope: TenantScopeV1;
  readonly subjectType: 'DASHBOARD_VERSION';
  readonly subjectId: string;
  readonly versionId: string;
  readonly canonicalHash: string;
  readonly action: 'PUBLISH';
  readonly audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS';
  readonly state: 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'INVALIDATED' | 'PENDING';
  readonly validUntil?: string;
}

export type DashboardPublicationApprovalLookupV1 =
  | { readonly accepted: true; readonly value: DashboardPublicationApprovalV1 }
  | { readonly accepted: false; readonly code: 'UNAVAILABLE' | 'NOT_FOUND' | 'INVALID' };

export interface DashboardPublicationApprovalInvalidationInstructionV1 {
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly priorPublishedVersionId: string;
}

/** Server-owned JRA decision lookup and durable prior-version invalidation boundary. */
export interface DashboardPublicationApprovalPortV1 {
  findCurrentPublicationApproval(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly versionId: string;
    readonly canonicalHash: string;
    readonly audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS';
  }): Promise<DashboardPublicationApprovalLookupV1>;
  preparePublicationApprovalInvalidation(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly priorPublishedVersionId: string;
  }): Promise<
    | {
        readonly accepted: true;
        readonly value: DashboardPublicationApprovalInvalidationInstructionV1;
      }
    | { readonly accepted: false; readonly code: 'UNAVAILABLE' | 'INVALID' }
  >;
}
