import { randomUUID } from 'node:crypto';

import {
  createJobDispatchRecordV1,
  type JobDispatchRecordV1,
} from '@databreeze/domain/dispatch/v1';
import { createJobV1, createTypedActionDefinitionV1, type JobV1 } from '@databreeze/domain/jobs/v1';
import {
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ReadyJobQueueRepositoryPortV1,
  ReadyJobQueueTransactionPortV1,
  ReadyJobQueueItemV1,
} from '../application/ready-job-queue.port.js';

export interface PrismaReadyJobQueueDispatchRowV1 {
  readonly id: string;
  readonly jobId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly eventType: string;
  readonly payloadHash: string;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly deliveredAt: Date | null;
  readonly revision: number;
}

export interface PrismaReadyJobQueueJobRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly requestedBy: string;
  readonly actionType: string;
  readonly actionVersion: number;
  readonly inputManifestHash: string;
  readonly idempotencyKey: string;
  readonly state: string;
  readonly revision: number;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
}

export interface PrismaReadyJobQueueActionRowV1 {
  readonly actionType: string;
  readonly version: number;
  readonly inputSchemaId: string;
  readonly outputSchemaId: string;
  readonly handlerDigest: string;
  readonly requiredCapabilities: unknown;
  readonly sideEffectClass: string;
  readonly riskClass: string;
  readonly defaultTimeoutSeconds: number;
  readonly maxAttempts: number;
  readonly approvalClass: string;
}

interface ReadyJobQueueDelegate<TValue> {
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<TValue | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
    readonly take?: number;
  }): Promise<readonly TValue[]>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
}

export interface PrismaReadyJobQueueDatabaseClientV1 {
  readonly jobDispatchRecord: ReadyJobQueueDelegate<PrismaReadyJobQueueDispatchRowV1>;
  readonly jobRecord: ReadyJobQueueDelegate<PrismaReadyJobQueueJobRowV1>;
  readonly typedActionDefinitionRecord: ReadyJobQueueDelegate<PrismaReadyJobQueueActionRowV1>;
  readonly jobTransitionRecord: ReadyJobQueueDelegate<never>;
  $transaction<TValue>(
    work: (transaction: PrismaReadyJobQueueDatabaseClientV1) => Promise<TValue>,
    options?: { readonly isolationLevel?: 'Serializable' },
  ): Promise<TValue>;
}

function scopeOf(scope: TenantScopeV1): Readonly<Record<string, unknown>> {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  };
}

function rowScope(row: {
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
}): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error(`JRA_READY_SCOPE_INVALID:${parsed.code}`);
  return parsed.value;
}

function rowJob(
  row: PrismaReadyJobQueueJobRowV1,
  actionRow: PrismaReadyJobQueueActionRowV1,
): JobV1 {
  const action = createTypedActionDefinitionV1({
    actionType: actionRow.actionType,
    version: actionRow.version,
    inputSchemaId: actionRow.inputSchemaId,
    outputSchemaId: actionRow.outputSchemaId,
    handlerDigest: actionRow.handlerDigest,
    requiredCapabilities: actionRow.requiredCapabilities,
    sideEffectClass: actionRow.sideEffectClass,
    riskClass: actionRow.riskClass,
    defaultTimeoutSeconds: actionRow.defaultTimeoutSeconds,
    maxAttempts: actionRow.maxAttempts,
    approvalClass: actionRow.approvalClass,
  });
  if (!action.accepted) throw new Error(`JRA_READY_ACTION_INVALID:${action.code}`);
  const created = createJobV1({
    jobId: row.id,
    tenantScope: rowScope(row),
    requestedBy: row.requestedBy,
    action: action.value,
    inputManifestHash: row.inputManifestHash,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  });
  if (!created.accepted) throw new Error(`JRA_READY_JOB_INVALID:${created.code}`);
  const validStates = new Set<JobV1['state']>([
    'CREATED',
    'QUEUED',
    'WAITING_FOR_DEVICE',
    'DISPATCHED',
    'RUNNING',
    'NEEDS_REVIEW',
    'AWAITING_APPROVAL',
    'SUCCEEDED',
    'PARTIALLY_SUCCEEDED',
    'FAILED',
    'CANCEL_REQUESTED',
    'CANCELLED',
    'EXPIRED',
  ]);
  if (!validStates.has(row.state as JobV1['state'])) throw new Error('JRA_READY_JOB_STATE_INVALID');
  const startedAt =
    row.startedAt === null ? undefined : parseStrictUtcTimestampV1(row.startedAt.toISOString());
  const finishedAt =
    row.finishedAt === null ? undefined : parseStrictUtcTimestampV1(row.finishedAt.toISOString());
  if (startedAt !== undefined && !startedAt.accepted)
    throw new Error(`JRA_READY_STARTED_AT_INVALID:${startedAt.code}`);
  if (finishedAt !== undefined && !finishedAt.accepted)
    throw new Error(`JRA_READY_FINISHED_AT_INVALID:${finishedAt.code}`);
  return Object.freeze({
    ...created.value,
    state: row.state as JobV1['state'],
    revision: row.revision,
    ...(startedAt?.accepted ? { startedAt: startedAt.value } : {}),
    ...(finishedAt?.accepted ? { finishedAt: finishedAt.value } : {}),
  });
}

function rowDispatch(row: PrismaReadyJobQueueDispatchRowV1): JobDispatchRecordV1 {
  const parsed = createJobDispatchRecordV1({
    dispatchId: row.id,
    jobId: row.jobId,
    tenantScope: rowScope(row),
    eventType: row.eventType,
    payloadHash: row.payloadHash,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  });
  if (!parsed.accepted) throw new Error(`JRA_READY_DISPATCH_INVALID:${parsed.code}`);
  const deliveredAt =
    row.deliveredAt === null ? undefined : parseStrictUtcTimestampV1(row.deliveredAt.toISOString());
  if (deliveredAt !== undefined && !deliveredAt.accepted)
    throw new Error(`JRA_READY_DELIVERED_AT_INVALID:${deliveredAt.code}`);
  return Object.freeze({
    ...parsed.value,
    ...(deliveredAt?.accepted ? { deliveredAt: deliveredAt.value } : {}),
    revision: row.revision,
  });
}

function jobData(job: JobV1): Readonly<Record<string, unknown>> {
  return {
    state: job.state,
    revision: job.revision,
    startedAt: job.startedAt === undefined ? null : new Date(job.startedAt),
    finishedAt: job.finishedAt === undefined ? null : new Date(job.finishedAt),
  };
}

function dispatchData(dispatch: JobDispatchRecordV1): Readonly<Record<string, unknown>> {
  return {
    deliveredAt: dispatch.deliveredAt === undefined ? null : new Date(dispatch.deliveredAt),
    revision: dispatch.revision,
  };
}

/** PostgreSQL queue bridge for the CREATED + JOB_READY -> QUEUED transition. */
export class PrismaReadyJobQueueRepositoryAdapter implements ReadyJobQueueRepositoryPortV1 {
  public constructor(private readonly client: PrismaReadyJobQueueDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ReadyJobQueueTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction(
      async (transaction) =>
        work({
          listPending: async (_context, limit) => {
            if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
            const rows = await transaction.jobDispatchRecord.findMany({
              where: {
                ...scopeOf(context.tenantScope),
                eventType: 'JOB_READY',
                deliveredAt: null,
              },
              orderBy: { createdAt: 'asc' },
              take: limit,
            });
            const items: ReadyJobQueueItemV1[] = [];
            for (const dispatchRow of rows) {
              const jobRow = await transaction.jobRecord.findFirst({
                where: { id: dispatchRow.jobId, ...scopeOf(context.tenantScope) },
              });
              if (!jobRow) continue;
              const actionRow = await transaction.typedActionDefinitionRecord.findFirst({
                where: {
                  actionType: jobRow.actionType,
                  version: jobRow.actionVersion,
                },
              });
              if (!actionRow) throw new Error('JRA_READY_ACTION_UNAVAILABLE');
              const job = rowJob(jobRow, actionRow);
              const dispatch = rowDispatch(dispatchRow);
              if (job.jobId !== dispatch.jobId) throw new Error('JRA_READY_JOB_DISPATCH_MISMATCH');
              items.push(Object.freeze({ job, dispatch }));
            }
            return items;
          },
          updateJob: async (_context, job, expectedRevision) => {
            const updated = await transaction.jobRecord.updateMany({
              where: {
                id: job.jobId,
                ...scopeOf(job.tenantScope),
                revision: expectedRevision,
              },
              data: jobData(job),
            });
            return updated.count === 1 ? job : undefined;
          },
          recordTransition: async (_context, input) => {
            await transaction.jobTransitionRecord.create({
              data: {
                id: randomUUID(),
                jobId: input.jobId,
                fromState: input.fromState,
                toState: input.toState,
                actorId: context.actorId,
                occurredAt: new Date(input.occurredAt),
                revision: input.revision,
              },
            });
          },
          updateDispatch: async (_context, dispatch, expectedRevision) => {
            const updated = await transaction.jobDispatchRecord.updateMany({
              where: {
                id: dispatch.dispatchId,
                jobId: dispatch.jobId,
                ...scopeOf(dispatch.tenantScope),
                revision: expectedRevision,
                deliveredAt: null,
              },
              data: dispatchData(dispatch),
            });
            return updated.count === 1 ? dispatch : undefined;
          },
        }),
      { isolationLevel: 'Serializable' },
    );
  }
}
