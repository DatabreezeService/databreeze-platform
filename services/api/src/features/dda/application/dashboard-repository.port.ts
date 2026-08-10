import type { DashboardVersionV1 } from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export const DASHBOARD_REPOSITORY_PORT = Symbol('DASHBOARD_REPOSITORY_PORT');

export interface DdaDashboardIdentityV1 {
  readonly dashboardId: string;
  readonly tenantScope: TenantScopeV1;
  readonly title: { readonly vi: string; readonly en: string };
  readonly status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  readonly draftVersionId?: string;
  readonly publishedVersionId?: string;
  readonly revision: number;
}

export interface DashboardRepositoryPortV1 {
  saveIdentity(identity: DdaDashboardIdentityV1): Promise<void>;
  findByDashboardId(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DdaDashboardIdentityV1 | undefined>;
  saveVersion(version: DashboardVersionV1): Promise<void>;
  findVersion(
    tenantScope: TenantScopeV1,
    versionId: string,
  ): Promise<DashboardVersionV1 | undefined>;
}
