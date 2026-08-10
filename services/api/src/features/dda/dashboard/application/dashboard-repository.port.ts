import type { DashboardVersionV1 } from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export interface DashboardDraftIdentityV1 {
  readonly dashboardId: string;
  readonly tenantScope: TenantScopeV1;
  readonly title: { readonly vi: string; readonly en: string };
  readonly status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  readonly draftVersionId?: string;
  readonly publishedVersionId?: string;
  readonly revision: number;
}

export interface DashboardDraftRepositoryPortV1 {
  saveIdentity(identity: DashboardDraftIdentityV1): Promise<void>;
  findIdentity(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardDraftIdentityV1 | undefined>;
  saveVersion(version: DashboardVersionV1): Promise<void>;
  findVersion(
    tenantScope: TenantScopeV1,
    versionId: string,
  ): Promise<DashboardVersionV1 | undefined>;
  saveRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
    readonly widget: DashboardVersionV1['widgets'][number];
  }): Promise<void>;
  findRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
  }): Promise<DashboardVersionV1['widgets'][number] | undefined>;
}
