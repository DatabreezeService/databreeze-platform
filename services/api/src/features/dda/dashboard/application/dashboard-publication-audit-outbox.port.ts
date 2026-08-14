import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export interface DashboardPublicationAuditOutboxMetadataV1 {
  readonly actorId: string;
  readonly correlationId: string;
  readonly authorizationEpoch: number;
  readonly approvalId?: string;
}

/** Prepares content-safe metadata; the repository durably enqueues it in the publication transaction. */
export interface DashboardPublicationAuditOutboxPortV1 {
  preparePublicationAudit(input: {
    readonly context: IamTenantContextV1;
    readonly dashboardId: string;
    readonly versionId: string;
    readonly audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS';
    readonly approvalId?: string;
  }): Promise<
    | { readonly accepted: true; readonly value: DashboardPublicationAuditOutboxMetadataV1 }
    | { readonly accepted: false; readonly code: 'UNAVAILABLE' | 'INVALID' }
  >;
}
