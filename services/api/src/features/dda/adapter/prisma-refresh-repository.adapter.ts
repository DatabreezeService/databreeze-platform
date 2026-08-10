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
import type {
  RefreshLifecycleStateV1,
  RefreshRecordV1,
} from '../refresh/application/refresh-coordinator.port.js';

export interface DashboardRefreshExecutionRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly dashboardId: string;
  readonly dashboardVersionId: string;
  readonly permissionProjectionVersionId: string;
  readonly datasetVersionId: string;
  readonly definitionIds: unknown;
  readonly inputSelectorHash: string;
  readonly sourceEventIds: unknown;
  readonly clientRequestIds: unknown;
  readonly folderReplayKeys: unknown;
  readonly state: string;
  readonly leaseId: string | null;
  readonly debounceWindowMs: number;
  readonly openedAtMs: number;
  readonly updatedAtMs: number;
  readonly updatedAt: Date;
}

export interface DashboardRefreshExecutionCreateV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly dashboardId: string;
  readonly dashboardVersionId: string;
  readonly permissionProjectionVersionId: string;
  readonly datasetVersionId: string;
  readonly definitionIds: unknown;
  readonly inputSelectorHash: string;
  readonly sourceEventIds: unknown;
  readonly clientRequestIds: unknown;
  readonly folderReplayKeys: unknown;
  readonly state: string;
  readonly leaseId: string | null;
  readonly debounceWindowMs: number;
  readonly openedAtMs: number;
  readonly updatedAtMs: number;
  readonly updatedAt: Date;
}

export interface DashboardRefreshIdempotencyRowV1 {
  readonly keyKind: string;
  readonly keyValue: string;
  readonly refreshId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
}

export interface DashboardRefreshEventCorrelationRowV1 {
  readonly eventId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly dashboardId: string;
  readonly snapshotId: string;
  readonly freshnessState: string;
  readonly occurredAt: Date;
  readonly eventHash: string;
}

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
  readonly dashboardRefreshExecutionRecord: {
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: DashboardRefreshExecutionCreateV1;
      readonly update: Omit<DashboardRefreshExecutionCreateV1, 'id'>;
    }): Promise<DashboardRefreshExecutionRowV1>;
    findFirst(input: {
      readonly where:
        | { readonly id: string }
        | {
            readonly openForDashboard: {
              readonly dashboardId: string;
              readonly organizationId?: string;
              readonly workspaceId?: string;
              readonly projectId?: string;
            };
          };
    }): Promise<DashboardRefreshExecutionRowV1 | null>;
  };
  readonly dashboardRefreshIdempotencyRecord: {
    upsert(input: {
      readonly where: {
        readonly keyKind_keyValue: { readonly keyKind: string; readonly keyValue: string };
      };
      readonly create: DashboardRefreshIdempotencyRowV1;
      readonly update: Omit<DashboardRefreshIdempotencyRowV1, 'keyKind' | 'keyValue'>;
    }): Promise<DashboardRefreshIdempotencyRowV1>;
    findFirst(input: {
      readonly where: {
        readonly keyKind: string;
        readonly keyValue: string;
        readonly organizationId?: string;
        readonly workspaceId?: string;
        readonly projectId?: string;
      };
    }): Promise<DashboardRefreshIdempotencyRowV1 | null>;
  };
  readonly dashboardRefreshEventCorrelationRecord?: {
    upsert(input: {
      readonly where: { readonly eventId: string };
      readonly create: DashboardRefreshEventCorrelationRowV1;
      readonly update: Omit<DashboardRefreshEventCorrelationRowV1, 'eventId'>;
    }): Promise<DashboardRefreshEventCorrelationRowV1>;
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
    const scope = scopeColumns(event.tenantScope);
    const correlation = this.client.dashboardRefreshEventCorrelationRecord;
    if (correlation === undefined) {
      throw new Error('DDA_REFRESH_EVENT_CORRELATION_UNAVAILABLE');
    }
    const data: DashboardRefreshEventCorrelationRowV1 = {
      eventId: event.eventId,
      ...scope,
      dashboardId: event.dashboardId,
      snapshotId: event.snapshotId,
      freshnessState: event.freshnessState,
      occurredAt: new Date(event.occurredAt),
      eventHash: event.eventHash,
    };
    await correlation.upsert({
      where: { eventId: event.eventId },
      create: data,
      update: {
        ...scope,
        dashboardId: data.dashboardId,
        snapshotId: data.snapshotId,
        freshnessState: data.freshnessState,
        occurredAt: data.occurredAt,
        eventHash: data.eventHash,
      },
    });
  }

  public async saveRefresh(record: RefreshRecordV1): Promise<void> {
    const scope = scopeColumns(record.tenantScope);
    const data: DashboardRefreshExecutionCreateV1 = {
      id: record.refreshId,
      ...scope,
      dashboardId: record.dashboardId,
      dashboardVersionId: record.dashboardVersionId,
      permissionProjectionVersionId: record.permissionProjectionVersionId,
      datasetVersionId: record.datasetVersionId,
      definitionIds: record.definitionIds,
      inputSelectorHash: record.inputSelectorHash,
      sourceEventIds: record.sourceEventIds,
      clientRequestIds: record.clientRequestIds,
      folderReplayKeys: record.folderReplayKeys,
      state: record.state,
      leaseId: record.leaseId ?? null,
      debounceWindowMs: record.debounceWindowMs,
      openedAtMs: record.openedAtMs,
      updatedAtMs: record.updatedAtMs,
      updatedAt: new Date(record.updatedAtMs),
    };
    await this.client.dashboardRefreshExecutionRecord.upsert({
      where: { id: record.refreshId },
      create: data,
      update: {
        ...scope,
        dashboardId: data.dashboardId,
        dashboardVersionId: data.dashboardVersionId,
        permissionProjectionVersionId: data.permissionProjectionVersionId,
        datasetVersionId: data.datasetVersionId,
        definitionIds: data.definitionIds,
        inputSelectorHash: data.inputSelectorHash,
        sourceEventIds: data.sourceEventIds,
        clientRequestIds: data.clientRequestIds,
        folderReplayKeys: data.folderReplayKeys,
        state: data.state,
        leaseId: data.leaseId,
        debounceWindowMs: data.debounceWindowMs,
        openedAtMs: data.openedAtMs,
        updatedAtMs: data.updatedAtMs,
        updatedAt: data.updatedAt,
      },
    });
    for (const sourceEventId of record.sourceEventIds) {
      await this.#saveIdempotency(scope, 'SOURCE_EVENT', sourceEventId, record.refreshId);
    }
    for (const clientRequestId of record.clientRequestIds) {
      await this.#saveIdempotency(scope, 'CLIENT_REQUEST', clientRequestId, record.refreshId);
    }
    for (const folderReplayKey of record.folderReplayKeys) {
      await this.#saveIdempotency(scope, 'FOLDER_REPLAY', folderReplayKey, record.refreshId);
    }
  }

  public async findRefresh(refreshId: string): Promise<RefreshRecordV1 | undefined> {
    const row = await this.client.dashboardRefreshExecutionRecord.findFirst({
      where: { id: refreshId },
    });
    return row === null ? undefined : rowToRefresh(row);
  }

  public async findOpenRefresh(dashboardId: string): Promise<RefreshRecordV1 | undefined> {
    const row = await this.client.dashboardRefreshExecutionRecord.findFirst({
      where: { openForDashboard: { dashboardId } },
    });
    return row === null ? undefined : rowToRefresh(row);
  }

  public async findByIdempotency(input: {
    readonly tenantScope?: TenantScopeV1;
    readonly sourceEventId?: string;
    readonly clientRequestId?: string;
    readonly folderReplayKey?: string;
  }): Promise<RefreshRecordV1 | undefined> {
    const candidates: Array<{ readonly keyKind: string; readonly keyValue: string }> = [];
    if (input.sourceEventId) {
      candidates.push({ keyKind: 'SOURCE_EVENT', keyValue: input.sourceEventId });
    }
    if (input.clientRequestId) {
      candidates.push({ keyKind: 'CLIENT_REQUEST', keyValue: input.clientRequestId });
    }
    if (input.folderReplayKey) {
      candidates.push({ keyKind: 'FOLDER_REPLAY', keyValue: input.folderReplayKey });
    }
    const scope = input.tenantScope ? scopeColumns(input.tenantScope) : undefined;
    for (const candidate of candidates) {
      const row = await this.client.dashboardRefreshIdempotencyRecord.findFirst({
        where: {
          keyKind: candidate.keyKind,
          keyValue: candidate.keyValue,
          ...(scope === undefined
            ? {}
            : {
                organizationId: scope.organizationId,
                workspaceId: scope.workspaceId,
                projectId: scope.projectId,
              }),
        },
      });
      if (row) return this.findRefresh(row.refreshId);
    }
    return undefined;
  }

  public async findLatestSnapshotForDashboard(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardSnapshotV1 | undefined> {
    const state = await this.findState(tenantScope, dashboardId);
    if (!state?.lastSnapshotId) return undefined;
    return this.findSnapshot(tenantScope, state.lastSnapshotId);
  }

  async #saveIdempotency(
    scope: {
      readonly scopeType: string;
      readonly organizationId: string;
      readonly workspaceId: string;
      readonly projectId: string;
    },
    keyKind: string,
    keyValue: string,
    refreshId: string,
  ): Promise<void> {
    const data: DashboardRefreshIdempotencyRowV1 = {
      keyKind,
      keyValue,
      refreshId,
      scopeType: scope.scopeType,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    };
    await this.client.dashboardRefreshIdempotencyRecord.upsert({
      where: { keyKind_keyValue: { keyKind, keyValue } },
      create: data,
      update: {
        refreshId,
        scopeType: data.scopeType,
        organizationId: data.organizationId,
        workspaceId: data.workspaceId,
        projectId: data.projectId,
      },
    });
  }

}

function asStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('DDA_PERSISTED_REFRESH_INVALID');
  }
  return Object.freeze([...value]);
}

function rowToRefresh(row: DashboardRefreshExecutionRowV1): RefreshRecordV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  const state = row.state as RefreshLifecycleStateV1;
  return Object.freeze({
    refreshId: row.id,
    tenantScope: parsed.value,
    dashboardId: row.dashboardId,
    dashboardVersionId: row.dashboardVersionId,
    permissionProjectionVersionId: row.permissionProjectionVersionId,
    datasetVersionId: row.datasetVersionId,
    definitionIds: asStringArray(row.definitionIds),
    inputSelectorHash: row.inputSelectorHash,
    sourceEventIds: asStringArray(row.sourceEventIds),
    clientRequestIds: asStringArray(row.clientRequestIds),
    folderReplayKeys: asStringArray(row.folderReplayKeys),
    state,
    ...(row.leaseId === null ? {} : { leaseId: row.leaseId }),
    debounceWindowMs: row.debounceWindowMs,
    openedAtMs: row.openedAtMs,
    updatedAtMs: row.updatedAtMs,
  });
}
