import type { DashboardVersionV1 } from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DashboardRepositoryPortV1,
  DdaDashboardIdentityV1,
} from '../application/dashboard-repository.port.js';

function requireProjectScope(tenantScope: TenantScopeV1): TenantScopeV1 & {
  readonly scopeType: 'project';
  readonly workspaceId: string;
  readonly projectId: string;
} {
  if (tenantScope.scopeType !== 'project' || !tenantScope.workspaceId || !tenantScope.projectId) {
    throw new Error('TENANT_SCOPE_REQUIRED');
  }
  return tenantScope;
}

function scopeKey(tenantScope: TenantScopeV1, id: string): string {
  const scoped = requireProjectScope(tenantScope);
  return `${scoped.organizationId}|${scoped.workspaceId}|${scoped.projectId}|${id}`;
}

export class InMemoryDashboardRepositoryAdapter implements DashboardRepositoryPortV1 {
  readonly #identities = new Map<string, DdaDashboardIdentityV1>();
  readonly #versions = new Map<string, DashboardVersionV1>();

  public saveIdentity(identity: DdaDashboardIdentityV1): Promise<void> {
    try {
      this.#identities.set(
        scopeKey(identity.tenantScope, identity.dashboardId),
        Object.freeze({ ...identity }),
      );
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public findByDashboardId(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DdaDashboardIdentityV1 | undefined> {
    try {
      return Promise.resolve(this.#identities.get(scopeKey(tenantScope, dashboardId)));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public saveVersion(version: DashboardVersionV1): Promise<void> {
    try {
      this.#versions.set(scopeKey(version.tenantScope, version.versionId), version);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public findVersion(
    tenantScope: TenantScopeV1,
    versionId: string,
  ): Promise<DashboardVersionV1 | undefined> {
    try {
      return Promise.resolve(this.#versions.get(scopeKey(tenantScope, versionId)));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
