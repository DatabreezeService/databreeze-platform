import type { DashboardVersionV1 } from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DashboardDraftIdentityV1,
  DashboardDraftRepositoryPortV1,
} from '../application/dashboard-repository.port.js';

function scopeKey(tenantScope: TenantScopeV1, id: string): string {
  const workspace = 'workspaceId' in tenantScope ? tenantScope.workspaceId : '';
  const project = 'projectId' in tenantScope ? tenantScope.projectId : '';
  return `${tenantScope.organizationId}|${workspace}|${project}|${id}`;
}

export class InMemoryDashboardDraftRepositoryAdapter implements DashboardDraftRepositoryPortV1 {
  readonly #identities = new Map<string, DashboardDraftIdentityV1>();
  readonly #versions = new Map<string, DashboardVersionV1>();
  readonly #removed = new Map<string, DashboardVersionV1['widgets'][number]>();

  public saveIdentity(identity: DashboardDraftIdentityV1): Promise<void> {
    this.#identities.set(
      scopeKey(identity.tenantScope, identity.dashboardId),
      Object.freeze({ ...identity }),
    );
    return Promise.resolve();
  }

  public findIdentity(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardDraftIdentityV1 | undefined> {
    return Promise.resolve(this.#identities.get(scopeKey(tenantScope, dashboardId)));
  }

  public saveVersion(version: DashboardVersionV1): Promise<void> {
    this.#versions.set(scopeKey(version.tenantScope, version.versionId), version);
    return Promise.resolve();
  }

  public findVersion(
    tenantScope: TenantScopeV1,
    versionId: string,
  ): Promise<DashboardVersionV1 | undefined> {
    return Promise.resolve(this.#versions.get(scopeKey(tenantScope, versionId)));
  }

  public saveRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
    readonly widget: DashboardVersionV1['widgets'][number];
  }): Promise<void> {
    this.#removed.set(
      `${scopeKey(input.tenantScope, input.dashboardId)}|${input.widgetId}`,
      input.widget,
    );
    return Promise.resolve();
  }

  public findRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
  }): Promise<DashboardVersionV1['widgets'][number] | undefined> {
    return Promise.resolve(
      this.#removed.get(`${scopeKey(input.tenantScope, input.dashboardId)}|${input.widgetId}`),
    );
  }
}
