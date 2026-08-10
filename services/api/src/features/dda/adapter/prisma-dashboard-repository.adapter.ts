import {
  createDashboardVersionV1,
  type DashboardVersionV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DashboardRepositoryPortV1,
  DdaDashboardIdentityV1,
} from '../application/dashboard-repository.port.js';

export interface DashboardRecordRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly titleVi: string;
  readonly titleEn: string;
  readonly status: string;
  readonly draftVersionId: string | null;
  readonly publishedVersionId: string | null;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DashboardRecordCreateV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly titleVi: string;
  readonly titleEn: string;
  readonly status: string;
  readonly draftVersionId: string | null;
  readonly publishedVersionId: string | null;
  readonly revision: number;
}

export interface DashboardVersionRecordRowV1 {
  readonly id: string;
  readonly dashboardId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly parentVersionId: string | null;
  readonly layoutGraph: unknown;
  readonly freshnessPolicy: string;
  readonly publicationPolicy: string;
  readonly locale: string;
  readonly timezone: string;
  readonly canonicalHash: string;
  readonly createdAt: Date;
}

export interface DashboardVersionRecordCreateV1 {
  readonly id: string;
  readonly dashboardId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly parentVersionId: string | null;
  readonly layoutGraph: unknown;
  readonly freshnessPolicy: string;
  readonly publicationPolicy: string;
  readonly locale: string;
  readonly timezone: string;
  readonly canonicalHash: string;
  readonly createdAt: Date;
}

export interface DdaDashboardDatabaseClientV1 {
  readonly dashboardRecord: {
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: DashboardRecordCreateV1;
      readonly update: Omit<DashboardRecordCreateV1, 'id'>;
    }): Promise<DashboardRecordRowV1>;
    findFirst(input: {
      readonly where: {
        readonly id: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<DashboardRecordRowV1 | null>;
  };
  readonly dashboardVersionRecord: {
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: DashboardVersionRecordCreateV1;
      readonly update: Omit<DashboardVersionRecordCreateV1, 'id' | 'createdAt'>;
    }): Promise<DashboardVersionRecordRowV1>;
    findFirst(input: {
      readonly where: {
        readonly id: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<DashboardVersionRecordRowV1 | null>;
  };
}

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

function scopeColumns(tenantScope: TenantScopeV1) {
  const scoped = requireProjectScope(tenantScope);
  return {
    scopeType: scoped.scopeType,
    organizationId: scoped.organizationId,
    workspaceId: scoped.workspaceId,
    projectId: scoped.projectId,
  } as const;
}

function rowToIdentity(row: DashboardRecordRowV1): DdaDashboardIdentityV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  const status = row.status;
  if (status !== 'DRAFT' && status !== 'PUBLISHED' && status !== 'ARCHIVED') {
    throw new Error('DDA_PERSISTED_STATUS_INVALID');
  }
  return Object.freeze({
    dashboardId: row.id,
    tenantScope: parsed.value,
    title: Object.freeze({ vi: row.titleVi, en: row.titleEn }),
    status,
    ...(row.draftVersionId === null ? {} : { draftVersionId: row.draftVersionId }),
    ...(row.publishedVersionId === null ? {} : { publishedVersionId: row.publishedVersionId }),
    revision: row.revision,
  });
}

function rowToVersion(row: DashboardVersionRecordRowV1): DashboardVersionV1 {
  const parsedScope = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsedScope.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  const graph =
    row.layoutGraph && typeof row.layoutGraph === 'object' && !Array.isArray(row.layoutGraph)
      ? (row.layoutGraph as Record<string, unknown>)
      : null;
  if (graph === null) throw new Error('DDA_PERSISTED_VERSION_INVALID');
  const created = createDashboardVersionV1({
    dashboardId: row.dashboardId,
    versionId: row.id,
    tenantScope: parsedScope.value,
    ...(row.parentVersionId === null ? {} : { parentVersionId: row.parentVersionId }),
    pages: graph['pages'],
    widgets: graph['widgets'],
    filters: graph['filters'],
    datasetBindings: graph['datasetBindings'],
    locale: row.locale,
    timezone: row.timezone,
    freshnessPolicy: row.freshnessPolicy,
    publicationPolicy: row.publicationPolicy,
    canonicalHash: row.canonicalHash,
    createdAt: row.createdAt.toISOString(),
  });
  if (!created.accepted) throw new Error('DDA_PERSISTED_VERSION_INVALID');
  return created.value;
}

export class PrismaDashboardRepositoryAdapter implements DashboardRepositoryPortV1 {
  public constructor(private readonly client: DdaDashboardDatabaseClientV1) {}

  public async saveIdentity(identity: DdaDashboardIdentityV1): Promise<void> {
    const scope = scopeColumns(identity.tenantScope);
    const data: DashboardRecordCreateV1 = {
      id: identity.dashboardId,
      ...scope,
      titleVi: identity.title.vi,
      titleEn: identity.title.en,
      status: identity.status,
      draftVersionId: identity.draftVersionId ?? null,
      publishedVersionId: identity.publishedVersionId ?? null,
      revision: identity.revision,
    };
    await this.client.dashboardRecord.upsert({
      where: { id: identity.dashboardId },
      create: data,
      update: {
        ...scope,
        titleVi: data.titleVi,
        titleEn: data.titleEn,
        status: data.status,
        draftVersionId: data.draftVersionId,
        publishedVersionId: data.publishedVersionId,
        revision: data.revision,
      },
    });
  }

  public async findByDashboardId(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DdaDashboardIdentityV1 | undefined> {
    const scope = scopeColumns(tenantScope);
    const row = await this.client.dashboardRecord.findFirst({
      where: {
        id: dashboardId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    return row === null ? undefined : rowToIdentity(row);
  }

  public async saveVersion(version: DashboardVersionV1): Promise<void> {
    const scope = scopeColumns(version.tenantScope);
    const layoutGraph = Object.freeze({
      pages: version.pages,
      widgets: version.widgets,
      filters: version.filters,
      datasetBindings: version.datasetBindings,
    });
    const data: DashboardVersionRecordCreateV1 = {
      id: version.versionId,
      dashboardId: version.dashboardId,
      ...scope,
      parentVersionId: version.parentVersionId ?? null,
      layoutGraph,
      freshnessPolicy: version.freshnessPolicy,
      publicationPolicy: version.publicationPolicy,
      locale: version.locale,
      timezone: version.timezone,
      canonicalHash: version.canonicalHash,
      createdAt: new Date(version.createdAt),
    };
    await this.client.dashboardVersionRecord.upsert({
      where: { id: version.versionId },
      create: data,
      update: {
        dashboardId: data.dashboardId,
        ...scope,
        parentVersionId: data.parentVersionId,
        layoutGraph: data.layoutGraph,
        freshnessPolicy: data.freshnessPolicy,
        publicationPolicy: data.publicationPolicy,
        locale: data.locale,
        timezone: data.timezone,
        canonicalHash: data.canonicalHash,
      },
    });
  }

  public async findVersion(
    tenantScope: TenantScopeV1,
    versionId: string,
  ): Promise<DashboardVersionV1 | undefined> {
    const scope = scopeColumns(tenantScope);
    const row = await this.client.dashboardVersionRecord.findFirst({
      where: {
        id: versionId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    return row === null ? undefined : rowToVersion(row);
  }
}
