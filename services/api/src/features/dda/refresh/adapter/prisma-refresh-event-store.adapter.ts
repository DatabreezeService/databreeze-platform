import { randomUUID } from 'node:crypto';

import {
  parseTenantScopeV1,
  tenantScopeKeyV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type { DdaDatabaseClientV1 } from '../../adapter/dda-database.client.js';
import { assertRefreshEventAppendInputV1 } from '../application/refresh-event-bus.js';
import type {
  DurableRefreshEventRecordV1,
  RefreshEventAppendInputV1,
  RefreshEventDurableStoreV1,
  RefreshEventPageV1,
} from '../application/refresh-event-bus.js';
import type { RefreshCommitOutboxPortV1 } from '../application/refresh-commit-outbox.port.js';
import {
  readDashboardSnapshotBindingProofV1,
  validateDashboardSnapshotBindingProofV1,
} from '../../dashboard/application/dashboard-repository.port.js';

type ProjectScopeV1 = TenantScopeV1 & {
  readonly scopeType: 'project';
  readonly workspaceId: string;
  readonly projectId: string;
};

function projectScope(tenantScope: TenantScopeV1): ProjectScopeV1 {
  if (tenantScope.scopeType !== 'project' || !tenantScope.workspaceId || !tenantScope.projectId) {
    throw new Error('TENANT_SCOPE_REQUIRED');
  }
  return tenantScope as ProjectScopeV1;
}

function scopeColumns(tenantScope: TenantScopeV1): {
  readonly scopeType: 'project';
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
} {
  const scoped = projectScope(tenantScope);
  return {
    scopeType: scoped.scopeType,
    organizationId: scoped.organizationId,
    workspaceId: scoped.workspaceId,
    projectId: scoped.projectId,
  };
}

function numberFromDatabaseSequence(value: bigint | number): number {
  const sequence = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error('DDA_REFRESH_EVENT_STORE_CORRUPT');
  }
  return sequence;
}

type DashboardRefreshEventRowV1 =
  Awaited<
    ReturnType<DdaDatabaseClientV1['dashboardRefreshEventRecord']['findFirst']>
  > extends infer T
    ? Exclude<T, null>
    : never;

interface DashboardRefreshEventCreateV1 {
  readonly eventId: string;
  readonly sequence: bigint | number;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly dashboardId: string;
  readonly snapshotId: string;
  readonly freshnessState: string;
  readonly eventKind: string;
  readonly metadata: unknown;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly authorizationEpoch: number | null;
  readonly eventHash: string;
}

function rowToRecord(row: DashboardRefreshEventRowV1): DurableRefreshEventRecordV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsed.accepted) throw new Error('DDA_REFRESH_EVENT_STORE_CORRUPT');
  return Object.freeze({
    eventId: row.eventId,
    sequence: numberFromDatabaseSequence(row.sequence),
    tenantScope: parsed.value,
    dashboardId: row.dashboardId,
    snapshotId: row.snapshotId,
    freshnessState: row.freshnessState as DurableRefreshEventRecordV1['freshnessState'],
    eventHash: row.eventHash,
    occurredAt: row.occurredAt.toISOString(),
    eventKind: row.eventKind as DurableRefreshEventRecordV1['eventKind'],
    correlationId: row.correlationId,
    ...(row.authorizationEpoch === null ? {} : { authorizationEpoch: row.authorizationEpoch }),
    metadata: row.metadata as DurableRefreshEventRecordV1['metadata'],
  });
}

function eventCreate(
  input: RefreshEventAppendInputV1,
  sequence: bigint,
): DashboardRefreshEventCreateV1 {
  const scope = scopeColumns(input.tenantScope);
  return {
    eventId: input.eventId ?? randomUUID(),
    sequence,
    ...scope,
    dashboardId: input.dashboardId,
    snapshotId: input.snapshotId,
    freshnessState: input.freshnessState,
    eventKind: input.eventKind,
    metadata: input.metadata,
    occurredAt: new Date(input.occurredAt),
    correlationId: input.correlationId,
    authorizationEpoch: input.authorizationEpoch ?? null,
    eventHash: input.eventHash,
  };
}

/** PostgreSQL-backed content-safe refresh event/outbox store (DDA-034/DDA-036). */
export class PrismaRefreshEventStoreAdapter
  implements RefreshEventDurableStoreV1, RefreshCommitOutboxPortV1
{
  public constructor(private readonly client: DdaDatabaseClientV1) {}

  public async append(input: RefreshEventAppendInputV1): Promise<DurableRefreshEventRecordV1> {
    const safeInput = assertRefreshEventAppendInputV1(input);
    const scope = scopeColumns(safeInput.tenantScope);
    const events = this.client.dashboardRefreshEventRecord;
    const transaction = this.client.$transaction;

    const existing = await events.findFirst({
      where: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        dashboardId: safeInput.dashboardId,
        eventHash: safeInput.eventHash,
      },
    });
    if (existing !== null) return rowToRecord(existing);

    try {
      return await transaction((scopedClient: DdaDatabaseClientV1) =>
        appendOnClient(scopedClient, safeInput),
      );
    } catch (error) {
      const duplicate = await events.findFirst({
        where: {
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          dashboardId: safeInput.dashboardId,
          eventHash: safeInput.eventHash,
        },
      });
      if (duplicate !== null) return rowToRecord(duplicate);
      throw error;
    }
  }

  public async commitSnapshotAndEvent(
    input: Parameters<RefreshCommitOutboxPortV1['commitSnapshotAndEvent']>[0],
  ): Promise<void> {
    const event = assertRefreshEventAppendInputV1(input.event);
    if (
      event.dashboardId !== input.dashboardId ||
      event.snapshotId !== input.snapshot.snapshotId ||
      event.correlationId !== input.refreshId ||
      event.eventKind !== 'SNAPSHOT_COMMITTED' ||
      event.eventHash !== input.snapshot.canonicalHash ||
      tenantScopeKeyV1(event.tenantScope) !== tenantScopeKeyV1(input.tenantScope) ||
      tenantScopeKeyV1(input.tenantScope) !== tenantScopeKeyV1(input.snapshot.tenantScope)
    ) {
      throw new Error('DDA_REFRESH_EVENT_BINDING_INVALID');
    }
    const scope = scopeColumns(input.snapshot.tenantScope);
    await this.client.$transaction(async (transaction: DdaDatabaseClientV1) => {
      const execution = await transaction.dashboardRefreshExecutionRecord.findFirst({
        where: { id: input.refreshId, ...scope },
      });
      if (execution === null) throw new Error('DDA_REFRESH_NOT_FOUND');
      if (
        execution.dashboardId !== input.dashboardId ||
        execution.dashboardVersionId !== input.snapshot.dashboardVersionId ||
        execution.permissionProjectionVersionId !== input.snapshot.permissionProjectionVersionId ||
        execution.inputSelectorHash !== input.expectedInputSelectorHash ||
        input.snapshot.inputSelectorHash !== input.expectedInputSelectorHash ||
        execution.leaseId !== input.expectedLeaseId
      ) {
        throw new Error('DDA_REFRESH_COMMIT_STALE');
      }
      const snapshotData = snapshotCreate(input.snapshot, scope);
      const existingSnapshot = await transaction.dashboardSnapshotRecord.findFirst({
        where: { id: input.snapshot.snapshotId },
      });
      if (execution.state === 'COMMITTED') {
        if (
          execution.revision !== input.expectedRevision + 1 ||
          existingSnapshot === null ||
          !snapshotMatches(existingSnapshot, snapshotData)
        ) {
          throw new Error('DDA_REFRESH_COMMIT_STALE');
        }
        const state = await transaction.dashboardRefreshStateRecord.findFirst({
          where: {
            dashboardId: input.dashboardId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
          },
        });
        if (state?.lastSnapshotId !== input.snapshot.snapshotId) {
          throw new Error('DDA_REFRESH_COMMIT_STALE');
        }
        await appendOnClient(transaction, event);
        return;
      }
      if (execution.state !== 'VERIFYING' || execution.revision !== input.expectedRevision) {
        throw new Error('DDA_REFRESH_COMMIT_STALE');
      }
      const currentState = await transaction.dashboardRefreshStateRecord.findFirst({
        where: {
          dashboardId: input.dashboardId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
        },
      });
      if (
        currentState?.lastSnapshotId &&
        currentState.lastSnapshotId !== input.snapshot.snapshotId
      ) {
        const currentSnapshot = await transaction.dashboardSnapshotRecord.findFirst({
          where: { id: currentState.lastSnapshotId, ...scope },
        });
        if (
          currentSnapshot !== null &&
          currentSnapshot.createdAt.getTime() > snapshotData.createdAt.getTime()
        ) {
          throw new Error('DDA_REFRESH_COMMIT_STALE');
        }
      }
      const marked = await transaction.dashboardRefreshExecutionRecord.updateMany({
        where: {
          id: input.refreshId,
          ...scope,
          state: 'VERIFYING',
          revision: input.expectedRevision,
          leaseId: input.expectedLeaseId,
          inputSelectorHash: input.expectedInputSelectorHash,
        },
        data: {
          state: 'COMMITTED',
          revision: input.expectedRevision + 1,
          openKey: null,
          updatedAtMs: snapshotData.createdAt.getTime(),
          updatedAt: snapshotData.createdAt,
        },
      });
      if (marked.count !== 1) {
        throw new Error('DDA_REFRESH_COMMIT_STALE');
      }
      if (existingSnapshot === null) {
        await transaction.dashboardSnapshotRecord.create({ data: snapshotData });
      } else if (!snapshotMatches(existingSnapshot, snapshotData)) {
        throw new Error('DDA_IMMUTABLE_SNAPSHOT_CONFLICT');
      }
      await transaction.dashboardRefreshStateRecord.upsert({
        where: {
          organizationId_workspaceId_projectId_dashboardId: {
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            dashboardId: input.dashboardId,
          },
        },
        create: {
          id: input.dashboardId,
          dashboardId: input.dashboardId,
          ...scope,
          freshnessPolicy: 'ON_CHANGE',
          lastSnapshotId: input.snapshot.snapshotId,
          lastJobId: input.refreshId,
          status: 'COMMITTED',
          reasonCode: null,
        },
        update: {
          ...scope,
          freshnessPolicy: 'ON_CHANGE',
          lastSnapshotId: input.snapshot.snapshotId,
          lastJobId: input.refreshId,
          status: 'COMMITTED',
          reasonCode: null,
        },
      });
      await appendOnClient(transaction, event);
    });
  }

  public async list(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly cursor: number;
    readonly limit: number;
  }): Promise<RefreshEventPageV1> {
    const scope = scopeColumns(input.tenantScope);
    const events = this.client.dashboardRefreshEventRecord;
    if (events === undefined) throw new Error('DDA_REFRESH_EVENT_STORE_UNAVAILABLE');
    if (!Number.isSafeInteger(input.cursor) || input.cursor < 0) {
      throw new Error('DDA_REFRESH_EVENT_STORE_CORRUPT');
    }
    const limit = Math.max(1, Math.min(input.limit, 100));
    const rows = await events.findMany({
      where: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        dashboardId: input.dashboardId,
        sequence: { gt: BigInt(input.cursor) },
      },
      orderBy: { sequence: 'asc' },
      take: limit + 1,
    });
    const latest = await events.findFirst({
      where: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        dashboardId: input.dashboardId,
      },
      orderBy: { sequence: 'desc' },
    });
    const oldest = await events.findFirst({
      where: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        dashboardId: input.dashboardId,
      },
      orderBy: { sequence: 'asc' },
    });
    const pageRows = rows.slice(0, limit);
    return Object.freeze({
      events: Object.freeze(pageRows.map(rowToRecord)),
      highestSequence: latest === null ? 0 : numberFromDatabaseSequence(latest.sequence),
      oldestSequence: oldest === null ? 0 : numberFromDatabaseSequence(oldest.sequence),
      hasMore: rows.length > limit,
    });
  }
}

function snapshotCreate(
  snapshot: DashboardSnapshotV1,
  scope: ReturnType<typeof scopeColumns>,
): {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly dashboardVersionId: string;
  readonly materializationIds: unknown;
  readonly bindingProof: unknown;
  readonly bindingProofVersion: 1;
  readonly permissionProjectionVersionId: string;
  readonly audience: string;
  readonly freshnessState: string;
  readonly evidenceState: string;
  readonly evidenceReferenceId: null;
  readonly canonicalHash: string;
  readonly createdAt: Date;
} {
  const bindingProof = readDashboardSnapshotBindingProofV1(snapshot);
  if (bindingProof === undefined) throw new Error('DDA_SNAPSHOT_BINDING_PROOF_REQUIRED');
  const validatedProof = validateDashboardSnapshotBindingProofV1({ snapshot, bindingProof });
  if (validatedProof === undefined) throw new Error('DDA_SNAPSHOT_BINDING_PROOF_INVALID');
  return {
    id: snapshot.snapshotId,
    ...scope,
    dashboardVersionId: snapshot.dashboardVersionId,
    materializationIds: Object.freeze({
      version: 1,
      bindingProofVersion: 1,
      ids: snapshot.materializationIds,
      inputSelectorHash: snapshot.inputSelectorHash,
      bindingProof: validatedProof,
    }),
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
}

function snapshotMatches(
  row: {
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
  },
  data: ReturnType<typeof snapshotCreate>,
): boolean {
  let materializationIdsMatch = false;
  try {
    materializationIdsMatch =
      JSON.stringify(row.materializationIds) === JSON.stringify(data.materializationIds);
  } catch {
    materializationIdsMatch = false;
  }
  return (
    row.id === data.id &&
    row.scopeType === data.scopeType &&
    row.organizationId === data.organizationId &&
    row.workspaceId === data.workspaceId &&
    row.projectId === data.projectId &&
    row.dashboardVersionId === data.dashboardVersionId &&
    row.bindingProofVersion === data.bindingProofVersion &&
    canonicalJson(row.bindingProof) === canonicalJson(data.bindingProof) &&
    materializationIdsMatch &&
    row.permissionProjectionVersionId === data.permissionProjectionVersionId &&
    row.audience === data.audience &&
    row.freshnessState === data.freshnessState &&
    row.evidenceState === data.evidenceState &&
    row.evidenceReferenceId === data.evidenceReferenceId &&
    row.canonicalHash === data.canonicalHash &&
    row.createdAt.getTime() === data.createdAt.getTime()
  );
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
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

async function appendOnClient(
  client: DdaDatabaseClientV1,
  input: RefreshEventAppendInputV1,
): Promise<DurableRefreshEventRecordV1> {
  const scope = scopeColumns(input.tenantScope);
  const events = client.dashboardRefreshEventRecord;
  const existing = await events.findFirst({
    where: {
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      dashboardId: input.dashboardId,
      eventHash: input.eventHash,
    },
  });
  if (existing !== null) return rowToRecord(existing);
  const sequenceRow = await client.dashboardRefreshEventSequenceRecord.upsert({
    where: {
      organizationId_workspaceId_projectId_dashboardId: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        dashboardId: input.dashboardId,
      },
    },
    create: {
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      dashboardId: input.dashboardId,
      nextSequence: 2n,
    },
    update: { nextSequence: { increment: 1n } },
  });
  const nextSequence = numberFromDatabaseSequence(sequenceRow.nextSequence);
  const row = await events.create({
    data: eventCreate(input, BigInt(nextSequence - 1)),
  });
  return rowToRecord(row);
}
