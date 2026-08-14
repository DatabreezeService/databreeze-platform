import { randomUUID as generateRefreshId } from 'node:crypto';

import {
  computeDashboardSnapshotHashV1,
  createDdaMaterializationV1,
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
  RefreshLifecycleTransitionInputV1,
  RefreshRecordV1,
  RefreshTriggerReservationInputV1,
  RefreshTriggerReservationResultV1,
} from '../refresh/application/refresh-coordinator.port.js';
import {
  attachDashboardSnapshotBindingProofV1,
  computeDashboardPublicationCanonicalHashV1,
  buildDashboardPublicationMaterializationBindingProofV1,
  readDashboardSnapshotBindingProofV1,
  validateDashboardSnapshotBindingProofV1,
} from '../dashboard/application/dashboard-repository.port.js';
import type { DashboardPublicationMaterializationBindingProofV1 } from '../dashboard/application/dashboard-publication-materialization.port.js';
import { buildMaterializationCacheKeyV1 } from '../refresh/application/materialization-cache-key.js';

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
  readonly revision: number;
  readonly openKey: string | null;
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
  readonly revision: number;
  readonly openKey: string | null;
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
  readonly bindingProof: unknown;
  readonly bindingProofVersion: number | null;
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
  readonly bindingProof: unknown;
  readonly bindingProofVersion: number;
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
    create(input: { readonly data: DashboardSnapshotCreateV1 }): Promise<DashboardSnapshotRowV1>;
    findFirst(input: {
      readonly where:
        | { readonly id: string }
        | {
            readonly id: string;
            readonly organizationId: string;
            readonly workspaceId: string;
            readonly projectId: string;
          };
    }): Promise<DashboardSnapshotRowV1 | null>;
  };
  readonly dashboardRefreshExecutionRecord: {
    create(input: {
      readonly data: DashboardRefreshExecutionCreateV1;
    }): Promise<DashboardRefreshExecutionRowV1>;
    findFirst(input: {
      readonly where: Record<string, unknown>;
    }): Promise<DashboardRefreshExecutionRowV1 | null>;
    updateMany(input: {
      readonly where: Record<string, unknown>;
      readonly data: Record<string, unknown>;
    }): Promise<{ readonly count: number }>;
    /** Legacy test-double compatibility; production persistence uses create/updateMany. */
    upsert?(input: {
      readonly where: Record<string, unknown>;
      readonly create: DashboardRefreshExecutionCreateV1;
      readonly update: Omit<DashboardRefreshExecutionCreateV1, 'id'>;
    }): Promise<DashboardRefreshExecutionRowV1>;
  };
  readonly dashboardRefreshIdempotencyRecord: {
    create(input: {
      readonly data: DashboardRefreshIdempotencyRowV1;
    }): Promise<DashboardRefreshIdempotencyRowV1>;
    findFirst(input: {
      readonly where: Record<string, unknown>;
    }): Promise<DashboardRefreshIdempotencyRowV1 | null>;
  };
  readonly dashboardRefreshEventCorrelationRecord?: {
    upsert(input: {
      readonly where: { readonly eventId: string };
      readonly create: DashboardRefreshEventCorrelationRowV1;
      readonly update: Omit<DashboardRefreshEventCorrelationRowV1, 'eventId'>;
    }): Promise<DashboardRefreshEventCorrelationRowV1>;
  };
  readonly $transaction?: <T>(
    callback: (transaction: DdaRefreshDatabaseClientV1) => Promise<T>,
  ) => Promise<T>;
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
  const proofVersion = row.bindingProofVersion;
  if (
    proofVersion !== 1 ||
    (envelope['bindingProofVersion'] !== undefined &&
      envelope['bindingProofVersion'] !== proofVersion)
  ) {
    throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  }
  let bindingProof: readonly DashboardPublicationMaterializationBindingProofV1[] = [];
  if (proofVersion === 1) {
    if (
      envelope['bindingProofVersion'] !== 1 ||
      row.bindingProof === null ||
      row.bindingProof === undefined ||
      envelope['bindingProof'] === undefined ||
      canonicalJson(row.bindingProof) !== canonicalJson(envelope['bindingProof'])
    ) {
      throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
    }
    if (!Array.isArray(row.bindingProof)) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
    for (const candidate of row.bindingProof) {
      if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
      }
      const proof = candidate as Record<string, unknown>;
      const materialization = createDdaMaterializationV1({
        materializationId: proof['materializationId'],
        tenantScope: proof['tenantScope'],
        dashboardVersionId: proof['dashboardVersionId'],
        widgetId: proof['widgetId'],
        analysisPlanVersionId: proof['analysisPlanVersionId'],
        datasetVersionId: proof['datasetVersionId'],
        semanticVersionId: proof['semanticVersionId'],
        metricVersionId: proof['metricVersionId'],
        permissionProjectionVersionId: proof['permissionProjectionVersionId'],
        parameterHash: proof['parameterHash'],
        locale: proof['locale'],
        timezone: proof['timezone'],
        engineVersion: proof['engineVersion'],
        adapterVersion: proof['adapterVersion'],
        effectivePolicyVersionId: proof['effectivePolicyVersionId'],
        resultManifestId: proof['resultManifestId'],
        cacheIdentityHash: proof['cacheIdentityHash'],
        createdAt: proof['materializationCreatedAt'],
      });
      if (!materialization.accepted) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
      const cacheKey = buildMaterializationCacheKeyV1({
        tenantScope: parsed.value,
        dashboardVersionId: materialization.value.dashboardVersionId,
        widgetId: materialization.value.widgetId,
        analysisPlanVersionId: materialization.value.analysisPlanVersionId,
        datasetVersionId: materialization.value.datasetVersionId,
        semanticVersionId: materialization.value.semanticVersionId,
        metricVersionId: materialization.value.metricVersionId,
        permissionProjectionVersionId: materialization.value.permissionProjectionVersionId,
        parameterHash: materialization.value.parameterHash,
        locale: materialization.value.locale,
        timezone: materialization.value.timezone,
        engineVersion: materialization.value.engineVersion,
        adapterVersion: materialization.value.adapterVersion,
        effectivePolicyVersionId: materialization.value.effectivePolicyVersionId,
      });
      if (
        !cacheKey.complete ||
        cacheKey.cacheIdentityHash !== materialization.value.cacheIdentityHash
      ) {
        throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
      }
      const expectedProof = buildDashboardPublicationMaterializationBindingProofV1({
        tenantScope: parsed.value,
        version: {
          versionId: materialization.value.dashboardVersionId,
          widgets: [
            {
              widgetId: materialization.value.widgetId,
              binding: {
                analysisPlanVersionId: materialization.value.analysisPlanVersionId,
                materializationDefinitionId: proof['materializationDefinitionId'] as never,
              },
            },
          ],
        } as never,
        materialization: materialization.value,
      });
      if (expectedProof === undefined || canonicalJson(expectedProof) !== canonicalJson(proof)) {
        throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
      }
      bindingProof = [...bindingProof, expectedProof];
    }
  } else {
    throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  }
  const baseCanonicalHash = computeDashboardSnapshotHashV1({
    snapshotId: row.id as never,
    tenantScope: parsed.value,
    dashboardVersionId: row.dashboardVersionId as never,
    materializationIds: envelope['ids'] as never,
    inputSelectorHash: envelope['inputSelectorHash'] as never,
    permissionProjectionVersionId: row.permissionProjectionVersionId as never,
    audience: row.audience as never,
    freshnessState: row.freshnessState as never,
    evidenceState: row.evidenceState as never,
    createdAt: row.createdAt.toISOString() as never,
  });
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
    canonicalHash: baseCanonicalHash,
    createdAt: row.createdAt.toISOString(),
  });
  if (!created.accepted) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  const publicationHash = computeDashboardPublicationCanonicalHashV1({
    snapshot: created.value,
    bindingProof,
  });
  if (publicationHash !== row.canonicalHash) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  return attachDashboardSnapshotBindingProofV1(
    Object.freeze({ ...created.value, canonicalHash: row.canonicalHash }),
    bindingProof,
  );
}

function uniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}

function reservationRetry(error: unknown): boolean {
  if (uniqueConstraint(error)) return true;
  if (error instanceof Error && error.message === 'DDA_REFRESH_RESERVATION_RETRY') return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2034'
  );
}

function isOpenState(state: string): boolean {
  return state === 'PENDING' || state === 'RUNNING' || state === 'VERIFYING';
}

function appendUnique(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : Object.freeze([...values, value]);
}

function canonicalJson(value: unknown): string {
  if (value === undefined) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const entries = Object.entries(value as Readonly<Record<string, unknown>>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function canonicalMaterializationEnvelope(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  }
  const envelope = value as Readonly<Record<string, unknown>>;
  return canonicalJson({
    version: envelope['version'],
    bindingProofVersion: envelope['bindingProofVersion'] ?? 0,
    ids: envelope['ids'],
    inputSelectorHash: envelope['inputSelectorHash'],
  });
}

function immutableSnapshotMatches(
  row: DashboardSnapshotRowV1,
  data: DashboardSnapshotCreateV1,
): boolean {
  return (
    row.id === data.id &&
    row.scopeType === data.scopeType &&
    row.organizationId === data.organizationId &&
    row.workspaceId === data.workspaceId &&
    row.projectId === data.projectId &&
    row.dashboardVersionId === data.dashboardVersionId &&
    row.bindingProofVersion === data.bindingProofVersion &&
    canonicalJson(row.bindingProof) === canonicalJson(data.bindingProof) &&
    canonicalMaterializationEnvelope(row.materializationIds) ===
      canonicalMaterializationEnvelope(data.materializationIds) &&
    row.permissionProjectionVersionId === data.permissionProjectionVersionId &&
    row.audience === data.audience &&
    row.freshnessState === data.freshnessState &&
    row.evidenceState === data.evidenceState &&
    row.evidenceReferenceId === data.evidenceReferenceId &&
    row.canonicalHash === data.canonicalHash &&
    row.createdAt.getTime() === data.createdAt.getTime()
  );
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
    const bindingProof = readDashboardSnapshotBindingProofV1(snapshot);
    if (bindingProof === undefined) throw new Error('DDA_SNAPSHOT_BINDING_PROOF_REQUIRED');
    const validatedProof = validateDashboardSnapshotBindingProofV1({ snapshot, bindingProof });
    if (validatedProof === undefined) throw new Error('DDA_SNAPSHOT_BINDING_PROOF_INVALID');
    const scope = scopeColumns(snapshot.tenantScope);
    const materializationIds = Object.freeze({
      version: 1,
      bindingProofVersion: 1,
      ids: snapshot.materializationIds,
      inputSelectorHash: snapshot.inputSelectorHash,
      bindingProof: validatedProof,
    });
    const data: DashboardSnapshotCreateV1 = {
      id: snapshot.snapshotId,
      ...scope,
      dashboardVersionId: snapshot.dashboardVersionId,
      materializationIds,
      bindingProof: validatedProof,
      bindingProofVersion: 1,
      permissionProjectionVersionId: snapshot.permissionProjectionVersionId,
      audience: snapshot.audience,
      freshnessState: snapshot.freshnessState,
      evidenceState: snapshot.evidenceState,
      evidenceReferenceId: null,
      canonicalHash: snapshot.canonicalHash,
      createdAt: new Date(snapshot.createdAt),
    };
    const existing = await this.client.dashboardSnapshotRecord.findFirst({
      where: { id: snapshot.snapshotId },
    });
    if (existing !== null) {
      if (immutableSnapshotMatches(existing, data)) return;
      throw new Error('DDA_IMMUTABLE_SNAPSHOT_CONFLICT');
    }
    try {
      await this.client.dashboardSnapshotRecord.create({ data });
    } catch (error) {
      if (uniqueConstraint(error)) {
        const raced = await this.client.dashboardSnapshotRecord.findFirst({
          where: { id: snapshot.snapshotId },
        });
        if (raced !== null && immutableSnapshotMatches(raced, data)) return;
        throw new Error('DDA_IMMUTABLE_SNAPSHOT_CONFLICT');
      }
      throw error;
    }
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
      revision: record.revision,
      openKey: isOpenState(record.state) ? record.dashboardId : null,
      leaseId: record.leaseId ?? null,
      debounceWindowMs: record.debounceWindowMs,
      openedAtMs: record.openedAtMs,
      updatedAtMs: record.updatedAtMs,
      updatedAt: new Date(record.updatedAtMs),
    };
    const existing = await this.client.dashboardRefreshExecutionRecord.findFirst({
      where: { id: record.refreshId },
    });
    if (
      existing !== null &&
      (existing.scopeType !== scope.scopeType ||
        existing.organizationId !== scope.organizationId ||
        existing.workspaceId !== scope.workspaceId ||
        existing.projectId !== scope.projectId ||
        existing.dashboardId !== data.dashboardId)
    ) {
      throw new Error('DDA_REFRESH_IDENTITY_CONFLICT');
    }
    if (existing !== null) throw new Error('DDA_REFRESH_TRANSITION_REQUIRED');
    try {
      await this.client.dashboardRefreshExecutionRecord.create({ data });
    } catch (error) {
      if (!uniqueConstraint(error)) throw error;
      const raced = await this.client.dashboardRefreshExecutionRecord.findFirst({
        where: {
          id: record.refreshId,
          ...scope,
        },
      });
      if (raced === null || raced.dashboardId !== data.dashboardId) {
        throw new Error('DDA_REFRESH_IDENTITY_CONFLICT');
      }
      throw new Error('DDA_REFRESH_TRANSITION_REQUIRED');
    }
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

  public async findRefresh(
    tenantScope: TenantScopeV1,
    refreshId: string,
  ): Promise<RefreshRecordV1 | undefined> {
    const scope = scopeColumns(tenantScope);
    const row = await this.client.dashboardRefreshExecutionRecord.findFirst({
      where: {
        id: refreshId,
        ...scope,
      },
    });
    return row === null ? undefined : rowToRefresh(row);
  }

  public async findOpenRefresh(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<RefreshRecordV1 | undefined> {
    const scope = scopeColumns(tenantScope);
    const row = await this.client.dashboardRefreshExecutionRecord.findFirst({
      where: {
        dashboardId,
        ...scope,
        state: { in: ['PENDING', 'RUNNING', 'VERIFYING'] },
      },
    });
    return row === null ? undefined : rowToRefresh(row);
  }

  public async reserveRefreshTrigger(
    input: RefreshTriggerReservationInputV1,
  ): Promise<RefreshTriggerReservationResultV1> {
    const transaction = this.client.$transaction;
    if (transaction === undefined) throw new Error('DDA_REFRESH_TRANSACTION_REQUIRED');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await transaction(async (client) => this.#reserveOnClient(client, input));
      } catch (error) {
        if (!reservationRetry(error) || attempt === 2) throw error;
      }
    }
    throw new Error('DDA_REFRESH_RESERVATION_RETRY_EXHAUSTED');
  }

  public async transitionRefresh(
    input: RefreshLifecycleTransitionInputV1,
  ): Promise<RefreshRecordV1> {
    if (
      (input.nextState === 'RUNNING' || input.nextState === 'VERIFYING') &&
      input.nextLeaseId === undefined
    ) {
      throw new Error('DDA_REFRESH_LEASE_REQUIRED');
    }
    const scope = scopeColumns(input.tenantScope);
    const updated = await this.client.dashboardRefreshExecutionRecord.updateMany({
      where: {
        id: input.refreshId,
        dashboardId: input.dashboardId,
        ...scope,
        revision: input.expectedRevision,
        state: input.expectedState,
        leaseId: input.expectedLeaseId ?? null,
      },
      data: {
        state: input.nextState,
        revision: { increment: 1 },
        openKey: isOpenState(input.nextState) ? input.dashboardId : null,
        leaseId: input.nextLeaseId ?? null,
        updatedAtMs: input.updatedAtMs,
        updatedAt: new Date(input.updatedAtMs),
      },
    });
    if (updated.count !== 1) throw new Error('DDA_REFRESH_TRANSITION_STALE');
    const row = await this.client.dashboardRefreshExecutionRecord.findFirst({
      where: { id: input.refreshId, ...scope },
    });
    if (row === null) throw new Error('DDA_REFRESH_TRANSITION_INVALID');
    return rowToRefresh(row);
  }

  public async findByIdempotency(input: {
    readonly tenantScope: TenantScopeV1;
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
    const scope = scopeColumns(input.tenantScope);
    for (const candidate of candidates) {
      const row = await this.client.dashboardRefreshIdempotencyRecord.findFirst({
        where: {
          keyKind: candidate.keyKind,
          keyValue: candidate.keyValue,
          ...scope,
        },
      });
      if (row) {
        const record = await this.findRefresh(input.tenantScope, row.refreshId);
        if (record === undefined) throw new Error('DDA_REFRESH_IDEMPOTENCY_CORRUPT');
        return record;
      }
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
    const existing = await this.client.dashboardRefreshIdempotencyRecord.findFirst({
      where: { ...data },
    });
    if (existing !== null) {
      if (
        existing.refreshId === refreshId &&
        existing.scopeType === data.scopeType &&
        existing.organizationId === data.organizationId &&
        existing.workspaceId === data.workspaceId &&
        existing.projectId === data.projectId
      ) {
        return;
      }
      throw new Error('DDA_REFRESH_IDEMPOTENCY_CONFLICT');
    }
    try {
      await this.client.dashboardRefreshIdempotencyRecord.create({ data });
    } catch (error) {
      if (!uniqueConstraint(error)) throw error;
      const raced = await this.client.dashboardRefreshIdempotencyRecord.findFirst({
        where: { ...data },
      });
      if (
        raced === null ||
        raced.refreshId !== refreshId ||
        raced.scopeType !== data.scopeType ||
        raced.organizationId !== data.organizationId ||
        raced.workspaceId !== data.workspaceId ||
        raced.projectId !== data.projectId
      ) {
        throw new Error('DDA_REFRESH_IDEMPOTENCY_CONFLICT');
      }
    }
  }

  async #reserveOnClient(
    client: DdaRefreshDatabaseClientV1,
    input: RefreshTriggerReservationInputV1,
  ): Promise<RefreshTriggerReservationResultV1> {
    const scope = scopeColumns(input.tenantScope);
    const candidates = [
      ['SOURCE_EVENT', input.sourceEventId] as const,
      ['CLIENT_REQUEST', input.clientRequestId] as const,
      ['FOLDER_REPLAY', input.folderReplayKey] as const,
    ];
    for (const [keyKind, keyValue] of candidates) {
      const existingKey = await client.dashboardRefreshIdempotencyRecord.findFirst({
        where: { keyKind, keyValue, ...scope },
      });
      if (existingKey !== null) {
        const existingRefresh = await client.dashboardRefreshExecutionRecord.findFirst({
          where: { id: existingKey.refreshId, ...scope },
        });
        if (existingRefresh === null) throw new Error('DDA_REFRESH_IDEMPOTENCY_CORRUPT');
        return Object.freeze({
          record: rowToRefresh(existingRefresh),
          idempotentReplay: true,
          coalesced: false,
        });
      }
    }

    const open = await client.dashboardRefreshExecutionRecord.findFirst({
      where: {
        dashboardId: input.dashboardId,
        ...scope,
        state: { in: ['PENDING', 'RUNNING', 'VERIFYING'] },
      },
    });
    const openDefinitions = open === null ? [] : asStringArray(open.definitionIds);
    const canCoalesce =
      open !== null &&
      open.dashboardVersionId === input.dashboardVersionId &&
      open.permissionProjectionVersionId === input.permissionProjectionVersionId &&
      open.datasetVersionId === input.datasetVersionId &&
      openDefinitions.length === input.definitionIds.length &&
      openDefinitions.every((id, index) => id === input.definitionIds[index]) &&
      input.occurredAtMs - open.openedAtMs <= open.debounceWindowMs;

    if (canCoalesce && open !== null) {
      const updated = await client.dashboardRefreshExecutionRecord.updateMany({
        where: { id: open.id, ...scope, revision: open.revision, state: open.state },
        data: {
          inputSelectorHash: input.inputSelectorHash,
          sourceEventIds: appendUnique(asStringArray(open.sourceEventIds), input.sourceEventId),
          clientRequestIds: appendUnique(
            asStringArray(open.clientRequestIds),
            input.clientRequestId,
          ),
          folderReplayKeys: appendUnique(
            asStringArray(open.folderReplayKeys),
            input.folderReplayKey,
          ),
          revision: open.revision + 1,
          updatedAtMs: input.occurredAtMs,
          updatedAt: new Date(input.occurredAtMs),
        },
      });
      if (updated.count !== 1) throw new Error('DDA_REFRESH_RESERVATION_RETRY');
      const refreshed = await client.dashboardRefreshExecutionRecord.findFirst({
        where: { id: open.id, ...scope },
      });
      if (refreshed === null) throw new Error('DDA_REFRESH_RESERVATION_RETRY');
      await this.#createReservationKeys(client, scope, input, refreshed.id);
      return Object.freeze({
        record: rowToRefresh(refreshed),
        idempotentReplay: false,
        coalesced: true,
      });
    }

    if (open !== null) {
      const superseded = await client.dashboardRefreshExecutionRecord.updateMany({
        where: { id: open.id, ...scope, revision: open.revision, state: open.state },
        data: {
          state: 'SUPERSEDED',
          openKey: null,
          revision: open.revision + 1,
          updatedAtMs: input.occurredAtMs,
          updatedAt: new Date(input.occurredAtMs),
        },
      });
      if (superseded.count !== 1) throw new Error('DDA_REFRESH_RESERVATION_RETRY');
    }

    const refreshId = generateRefreshId();
    const created = await client.dashboardRefreshExecutionRecord.create({
      data: {
        id: refreshId,
        ...scope,
        dashboardId: input.dashboardId,
        dashboardVersionId: input.dashboardVersionId,
        permissionProjectionVersionId: input.permissionProjectionVersionId,
        datasetVersionId: input.datasetVersionId,
        definitionIds: input.definitionIds,
        inputSelectorHash: input.inputSelectorHash,
        sourceEventIds: [input.sourceEventId],
        clientRequestIds: [input.clientRequestId],
        folderReplayKeys: [input.folderReplayKey],
        state: 'PENDING',
        revision: 1,
        openKey: input.dashboardId,
        leaseId: null,
        debounceWindowMs: input.debounceWindowMs,
        openedAtMs: input.occurredAtMs,
        updatedAtMs: input.occurredAtMs,
        updatedAt: new Date(input.occurredAtMs),
      },
    });
    await this.#createReservationKeys(client, scope, input, refreshId);
    return Object.freeze({
      record: rowToRefresh(created),
      idempotentReplay: false,
      coalesced: false,
    });
  }

  async #createReservationKeys(
    client: DdaRefreshDatabaseClientV1,
    scope: ReturnType<typeof scopeColumns>,
    input: RefreshTriggerReservationInputV1,
    refreshId: string,
  ): Promise<void> {
    for (const [keyKind, keyValue] of [
      ['SOURCE_EVENT', input.sourceEventId],
      ['CLIENT_REQUEST', input.clientRequestId],
      ['FOLDER_REPLAY', input.folderReplayKey],
    ] as const) {
      await client.dashboardRefreshIdempotencyRecord.create({
        data: { keyKind, keyValue, refreshId, ...scope },
      });
    }
  }
}

function asStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error('DDA_PERSISTED_REFRESH_INVALID');
  const strings = value.map((item: unknown) => {
    if (typeof item !== 'string') throw new Error('DDA_PERSISTED_REFRESH_INVALID');
    return item;
  });
  return Object.freeze(strings);
}

function rowToRefresh(row: DashboardRefreshExecutionRowV1): RefreshRecordV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  if (
    row.state !== 'PENDING' &&
    row.state !== 'RUNNING' &&
    row.state !== 'VERIFYING' &&
    row.state !== 'COMMITTED' &&
    row.state !== 'BLOCKED' &&
    row.state !== 'FAILED' &&
    row.state !== 'SUPERSEDED'
  ) {
    throw new Error('DDA_PERSISTED_REFRESH_INVALID');
  }
  if (!Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error('DDA_PERSISTED_REFRESH_INVALID');
  }
  if (isOpenState(row.state) !== (row.openKey === row.dashboardId)) {
    throw new Error('DDA_PERSISTED_REFRESH_INVALID');
  }
  if ((row.state === 'RUNNING' || row.state === 'VERIFYING') && row.leaseId === null) {
    throw new Error('DDA_PERSISTED_REFRESH_INVALID');
  }
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
    revision: row.revision,
    ...(row.leaseId === null ? {} : { leaseId: row.leaseId }),
    debounceWindowMs: row.debounceWindowMs,
    openedAtMs: row.openedAtMs,
    updatedAtMs: row.updatedAtMs,
  });
}
