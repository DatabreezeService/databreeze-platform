export type DashboardAuthActionV1 =
  | 'VIEW'
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
    readonly tenantScope: unknown;
    readonly actorId: unknown;
    readonly snapshotId?: string;
    readonly dashboardId?: string;
    readonly action: DashboardAuthActionV1;
  }): Promise<DashboardAuthorizationDecisionV1>;
  projectVisibleFields(input: {
    readonly tenantScope: unknown;
    readonly actorId: unknown;
    readonly snapshotId: string;
  }): Promise<readonly string[]>;
}
