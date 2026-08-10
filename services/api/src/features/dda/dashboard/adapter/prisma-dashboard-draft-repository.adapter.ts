import type { DashboardVersionV1 } from '@databreeze/domain/data-to-dashboard/v1';
import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DashboardDraftIdentityV1,
  DashboardDraftRepositoryPortV1,
} from '../application/dashboard-repository.port.js';

export interface DashboardDraftRecordRowV1 {
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

export interface DashboardDraftRecordCreateV1 {
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

export interface DashboardRemovedWidgetRowV1 {
  readonly dashboardId: string;
  readonly widgetId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly widgetDocument: unknown;
}

export interface DdaDashboardDraftDatabaseClientV1 {
  readonly dashboardRecord: {
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: DashboardDraftRecordCreateV1;
      readonly update: Omit<DashboardDraftRecordCreateV1, 'id'>;
    }): Promise<DashboardDraftRecordRowV1>;
    findFirst(input: {
      readonly where: {
        readonly id: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<DashboardDraftRecordRowV1 | null>;
  };
  readonly dashboardVersionRecord: {
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: Record<string, unknown>;
      readonly update: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
    findFirst(input: {
      readonly where: {
        readonly id: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<Record<string, unknown> | null>;
  };
  readonly dashboardRemovedWidgetRecord: {
    upsert(input: {
      readonly where: {
        readonly dashboardId_widgetId: {
          readonly dashboardId: string;
          readonly widgetId: string;
        };
      };
      readonly create: DashboardRemovedWidgetRowV1;
      readonly update: Omit<DashboardRemovedWidgetRowV1, 'dashboardId' | 'widgetId'>;
    }): Promise<DashboardRemovedWidgetRowV1>;
    findFirst(input: {
      readonly where: {
        readonly dashboardId: string;
        readonly widgetId: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<DashboardRemovedWidgetRowV1 | null>;
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

export class PrismaDashboardDraftRepositoryAdapter implements DashboardDraftRepositoryPortV1 {
  public constructor(private readonly client: DdaDashboardDraftDatabaseClientV1) {}

  public async saveIdentity(identity: DashboardDraftIdentityV1): Promise<void> {
    const scope = requireProjectScope(identity.tenantScope);
    const data: DashboardDraftRecordCreateV1 = {
      id: identity.dashboardId,
      scopeType: scope.scopeType,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
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
        scopeType: data.scopeType,
        organizationId: data.organizationId,
        workspaceId: data.workspaceId,
        projectId: data.projectId,
        titleVi: data.titleVi,
        titleEn: data.titleEn,
        status: data.status,
        draftVersionId: data.draftVersionId,
        publishedVersionId: data.publishedVersionId,
        revision: data.revision,
      },
    });
  }

  public async findIdentity(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardDraftIdentityV1 | undefined> {
    const scope = requireProjectScope(tenantScope);
    const row = await this.client.dashboardRecord.findFirst({
      where: {
        id: dashboardId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    if (row === null) return undefined;
    const parsed = parseTenantScopeV1({
      scopeType: row.scopeType,
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
    });
    if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
    if (row.status !== 'DRAFT' && row.status !== 'PUBLISHED' && row.status !== 'ARCHIVED') {
      throw new Error('DDA_PERSISTED_DRAFT_INVALID');
    }
    return Object.freeze({
      dashboardId: row.id,
      tenantScope: parsed.value,
      title: Object.freeze({ vi: row.titleVi, en: row.titleEn }),
      status: row.status,
      ...(row.draftVersionId === null ? {} : { draftVersionId: row.draftVersionId }),
      ...(row.publishedVersionId === null ? {} : { publishedVersionId: row.publishedVersionId }),
      revision: row.revision,
    });
  }

  public saveVersion(version: DashboardVersionV1): Promise<void> {
    const scope = requireProjectScope(version.tenantScope);
    return this.client.dashboardVersionRecord
      .upsert({
        where: { id: version.versionId },
        create: {
          id: version.versionId,
          dashboardId: version.dashboardId,
          scopeType: scope.scopeType,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          parentVersionId: version.parentVersionId ?? null,
          layoutGraph: version,
          freshnessPolicy: version.freshnessPolicy,
          publicationPolicy: version.publicationPolicy,
          locale: version.locale,
          timezone: version.timezone,
          canonicalHash: version.canonicalHash,
          createdAt: new Date(version.createdAt),
        },
        update: {
          dashboardId: version.dashboardId,
          scopeType: scope.scopeType,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          parentVersionId: version.parentVersionId ?? null,
          layoutGraph: version,
          freshnessPolicy: version.freshnessPolicy,
          publicationPolicy: version.publicationPolicy,
          locale: version.locale,
          timezone: version.timezone,
          canonicalHash: version.canonicalHash,
        },
      })
      .then(() => undefined);
  }

  public async findVersion(
    tenantScope: TenantScopeV1,
    versionId: string,
  ): Promise<DashboardVersionV1 | undefined> {
    const scope = requireProjectScope(tenantScope);
    const row = await this.client.dashboardVersionRecord.findFirst({
      where: {
        id: versionId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    if (row === null) return undefined;
    return row['layoutGraph'] as DashboardVersionV1;
  }

  public async saveRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
    readonly widget: DashboardVersionV1['widgets'][number];
  }): Promise<void> {
    const scope = requireProjectScope(input.tenantScope);
    await this.client.dashboardRemovedWidgetRecord.upsert({
      where: {
        dashboardId_widgetId: {
          dashboardId: input.dashboardId,
          widgetId: input.widgetId,
        },
      },
      create: {
        dashboardId: input.dashboardId,
        widgetId: input.widgetId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        widgetDocument: input.widget,
      },
      update: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        widgetDocument: input.widget,
      },
    });
  }

  public async findRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
  }): Promise<DashboardVersionV1['widgets'][number] | undefined> {
    const scope = requireProjectScope(input.tenantScope);
    const row = await this.client.dashboardRemovedWidgetRecord.findFirst({
      where: {
        dashboardId: input.dashboardId,
        widgetId: input.widgetId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    if (row === null) return undefined;
    return row.widgetDocument as DashboardVersionV1['widgets'][number];
  }
}
