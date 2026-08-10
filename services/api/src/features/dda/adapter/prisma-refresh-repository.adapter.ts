import {
  createDashboardSnapshotV1,
  type DashboardSnapshotV1,
  type DdaRefreshEventV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DdaRefreshStateV1,
  RefreshRepositoryPortV1,
} from '../application/refresh-repository.port.js';

export interface DashboardRefreshStateRowV1 {
  readonly id: string;
  readonly dashboardId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly freshnessPolicy: string;
  readonly lastSnapshotId: string | null;
  readonly lastJobId: string | null;
  readonly status: string;
  readonly reasonCode: string | null;
  readonly updatedAt: Date;
}

export interface DashboardRefreshStateCreateV1 {
  readonly id: string;
  readonly dashboardId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly freshnessPolicy: string;
  readonly lastSnapshotId: string | null;
  readonly lastJobId: string | null;
  readonly status: string;
  readonly reasonCode: string | null;
}

export interface DashboardSnapshotRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly dashboardVersionId: string;
  readonly materializationIds: unknown;
  readonly permissionProjectionVersionId: string;
  readonly audience: string;
  readonly freshnessState: string;
  readonly evidenceState: string;
  readonly evidenceReferenceId: string | null;
  readonly canonicalHash: string;
  readonly createdAt: Date;
}

export interface DashboardSnapshotCreateV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly dashboardVersionId: string;
  readonly materializationIds: unknown;
  readonly permissionProjectionVersionId: string;
  readonly audience: string;
  readonly freshnessState: string;
  readonly evidenceState: string;
  readonly evidenceReferenceId: string | null;
  readonly canonicalHash: string;
  readonly createdAt: Date;
}

export interface DdaRefreshDatabaseClientV1 {
  readonly dashboardRefreshStateRecord: {
    upsert(input: {
      readonly where: {
        readonly organizationId_workspaceId_projectId_dashboardId: {
          readonly organizationId: string;
          readonly workspaceId: string;
          readonly projectId: string;
          readonly dashboardId: string;
        };
      };
      readonly create: DashboardRefreshStateCreateV1;
      readonly update: Omit<DashboardRefreshStateCreateV1, 'id' | 'dashboardId'>;
    }): Promise<DashboardRefreshStateRowV1>;
    findFirst(input: {
      readonly where: {
        readonly dashboardId: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<DashboardRefreshStateRowV1 | null>;
  };
  readonly dashboardSnapshotRecord: {
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: DashboardSnapshotCreateV1;
      readonly update: Omit<DashboardSnapshotCreateV1, 'id' | 'createdAt'>;
    }): Promise<DashboardSnapshotRowV1>;
    findFirst(input: {
      readonly where: {
        readonly id: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<DashboardSnapshotRowV1 | null>;
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

function rowToState(row: DashboardRefreshStateRowV1): DdaRefreshStateV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  const freshnessPolicy = row.freshnessPolicy;
  if (
    freshnessPolicy !== 'ON_CHANGE' &&
    freshnessPolicy !== 'MANUAL' &&
    freshnessPolicy !== 'SCHEDULED'
  ) {
    throw new Error('DDA_PERSISTED_REFRESH_INVALID');
  }
  return Object.freeze({
    dashboardId: row.dashboardId,
    tenantScope: parsed.value,
    freshnessPolicy,
    ...(row.lastSnapshotId === null ? {} : { lastSnapshotId: row.lastSnapshotId }),
    ...(row.lastJobId === null ? {} : { lastJobId: row.lastJobId }),
    status: row.status,
    ...(row.reasonCode === null ? {} : { reasonCode: row.reasonCode }),
  });
}

function rowToSnapshot(row: DashboardSnapshotRowV1): DashboardSnapshotV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  const envelope =
    row.materializationIds &&
    typeof row.materializationIds === 'object' &&
    !Array.isArray(row.materializationIds)
      ? (row.materializationIds as Record<string, unknown>)
      : null;
  if (envelope === null) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  const created = createDashboardSnapshotV1({
    snapshotId: row.id,
    tenantScope: parsed.value,
    dashboardVersionId: row.dashboardVersionId,
    materializationIds: envelope['ids'],
    inputSelectorHash: envelope['inputSelectorHash'],
    permissionProjectionVersionId: row.permissionProjectionVersionId,
    audience: row.audience,
    freshnessState: row.freshnessState,
    evidenceState: row.evidenceState,
    canonicalHash: row.canonicalHash,
    createdAt: row.createdAt.toISOString(),
  });
  if (!created.accepted) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  return created.value;
}

export class PrismaRefreshRepositoryAdapter implements RefreshRepositoryPortV1 {
  public constructor(private readonly client: DdaRefreshDatabaseClientV1) {}

  public async saveState(state: DdaRefreshStateV1): Promise<void> {
    const scope = scopeColumns(state.tenantScope);
    const data: DashboardRefreshStateCreateV1 = {
      id: state.dashboardId,
      dashboardId: state.dashboardId,
      ...scope,
      freshnessPolicy: state.freshnessPolicy,
      lastSnapshotId: state.lastSnapshotId ?? null,
      lastJobId: state.lastJobId ?? null,
      status: state.status,
      reasonCode: state.reasonCode ?? null,
    };
    await this.client.dashboardRefreshStateRecord.upsert({
      where: {
        organizationId_workspaceId_projectId_dashboardId: {
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          dashboardId: state.dashboardId,
        },
      },
      create: data,
      update: {
        ...scope,
        freshnessPolicy: data.freshnessPolicy,
        lastSnapshotId: data.lastSnapshotId,
        lastJobId: data.lastJobId,
        status: data.status,
        reasonCode: data.reasonCode,
      },
    });
  }

  public async findState(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DdaRefreshStateV1 | undefined> {
    const scope = scopeColumns(tenantScope);
    const row = await this.client.dashboardRefreshStateRecord.findFirst({
      where: {
        dashboardId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    return row === null ? undefined : rowToState(row);
  }

  public async saveSnapshot(snapshot: DashboardSnapshotV1): Promise<void> {
    const scope = scopeColumns(snapshot.tenantScope);
    const materializationIds = Object.freeze({
      version: 1,
      ids: snapshot.materializationIds,
      inputSelectorHash: snapshot.inputSelectorHash,
    });
    const data: DashboardSnapshotCreateV1 = {
      id: snapshot.snapshotId,
      ...scope,
      dashboardVersionId: snapshot.dashboardVersionId,
      materializationIds,
      permissionProjectionVersionId: snapshot.permissionProjectionVersionId,
      audience: snapshot.audience,
      freshnessState: snapshot.freshnessState,
      evidenceState: snapshot.evidenceState,
      evidenceReferenceId: null,
      canonicalHash: snapshot.canonicalHash,
      createdAt: new Date(snapshot.createdAt),
    };
    await this.client.dashboardSnapshotRecord.upsert({
      where: { id: snapshot.snapshotId },
      create: data,
      update: {
        ...scope,
        dashboardVersionId: data.dashboardVersionId,
        materializationIds: data.materializationIds,
        permissionProjectionVersionId: data.permissionProjectionVersionId,
        audience: data.audience,
        freshnessState: data.freshnessState,
        evidenceState: data.evidenceState,
        evidenceReferenceId: data.evidenceReferenceId,
        canonicalHash: data.canonicalHash,
      },
    });
  }

  public async findSnapshot(
    tenantScope: TenantScopeV1,
    snapshotId: string,
  ): Promise<DashboardSnapshotV1 | undefined> {
    const scope = scopeColumns(tenantScope);
    const row = await this.client.dashboardSnapshotRecord.findFirst({
      where: {
        id: snapshotId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    return row === null ? undefined : rowToSnapshot(row);
  }

  public async recordRefreshEvent(event: DdaRefreshEventV1): Promise<void> {
    // Refresh events remain AUD-correlated; DDA schema has no event blob table (DDA-001).
    requireProjectScope(event.tenantScope);
  }
}
