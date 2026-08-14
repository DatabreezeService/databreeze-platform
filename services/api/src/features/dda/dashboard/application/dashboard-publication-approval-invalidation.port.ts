import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { DashboardPublicationApprovalInvalidationInstructionV1 } from './dashboard-publication-approval.port.js';

export type DashboardPublicationApprovalInvalidationResultV1 =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly code: 'INVALID' | 'UNAVAILABLE' };

/** Narrow root/JRA boundary used only after the publication transaction commits. */
export interface DashboardPublicationApprovalInvalidationExecutorPortV1 {
  invalidatePublicationApproval(
    input: DashboardPublicationApprovalInvalidationInstructionV1,
  ): Promise<DashboardPublicationApprovalInvalidationResultV1>;
}

export interface DashboardPublicationApprovalInvalidationScopeV1 {
  readonly tenantScope: TenantScopeV1;
  readonly workerId: string;
  readonly now: Date;
  readonly leaseDurationMs: number;
}
