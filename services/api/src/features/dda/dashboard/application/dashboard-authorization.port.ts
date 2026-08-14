import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export type DashboardAuthActionV1 =
  | 'VIEW'
  | 'EDIT'
  | 'FILTER'
  | 'DRILL'
  | 'DOWNLOAD'
  | 'SUBSCRIBE'
  | 'RESOLVE_SHARE'
  | 'PUBLISH'
  | 'SHARE'
  | 'EXPORT';

export interface DashboardAuthorizationDecisionV1 {
  readonly allowed: boolean;
  readonly grantsDatasetAccess: boolean;
  readonly grantsOriginalAccess?: boolean;
  readonly grantsEvidenceAccess?: boolean;
  readonly grantsAnalysisAccess?: boolean;
  readonly grantsFolderAccess?: boolean;
  readonly grantsRowFieldExpansion?: boolean;
}

export interface DashboardAuthorizationPortV1 {
  authorizeDashboardAction(input: {
    /** Trusted request context supplied by the API boundary; client fields are never accepted. */
    readonly context?: IamTenantContextV1;
    readonly tenantScope: unknown;
    readonly actorId: unknown;
    readonly snapshotId?: string;
    readonly dashboardId?: string;
    readonly action: DashboardAuthActionV1;
  }): Promise<DashboardAuthorizationDecisionV1>;
  projectVisibleFields(input: {
    /** Trusted request context supplied by the API boundary; client fields are never accepted. */
    readonly context?: IamTenantContextV1;
    readonly tenantScope: unknown;
    readonly actorId: unknown;
    readonly snapshotId: string;
  }): Promise<readonly string[]>;
}
