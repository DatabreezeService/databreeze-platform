import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export interface DashboardPublicationAudiencePortV1 {
  authorizePublicationAudience(input: {
    readonly tenantScope: TenantScopeV1;
    readonly actorId: string;
    readonly dashboardId: string;
    readonly versionId: string;
    readonly audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS';
    readonly authorizationEpoch: number;
  }): Promise<{ readonly allowed: boolean }>;
}
