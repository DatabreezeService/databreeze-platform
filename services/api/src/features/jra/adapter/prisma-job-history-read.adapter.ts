import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  JobHistoryEntryV1,
  JobHistoryListQueryV1,
  JobHistoryPageV1,
  JobHistoryReadPortV1,
  JobHistoryStateV1,
} from '../application/job-history-read.port.js';

export interface JobHistoryDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly actionType: string;
  readonly actionVersion: number;
  readonly state: string;
  readonly revision: number;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
}

export interface JobHistoryDatabaseClientV1 {
  readonly jobRecord: {
    findMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy: readonly Readonly<Record<string, 'asc' | 'desc'>>[];
      readonly take: number;
    }): Promise<readonly JobHistoryDatabaseRowV1[]>;
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
    }): Promise<JobHistoryDatabaseRowV1 | null>;
  };
}

const states: readonly JobHistoryStateV1[] = [
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
];

function scopeWhere(scope: TenantScopeV1): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: scope.organizationId };
  if (scope.scopeType === 'workspace' || scope.scopeType === 'project') {
    where['workspaceId'] = scope.workspaceId;
  }
  if (scope.scopeType === 'project') where['projectId'] = scope.projectId;
  return where;
}

function rowScope(row: JobHistoryDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('JRA_PERSISTED_JOB_HISTORY_SCOPE_INVALID');
  return parsed.value;
}

function timestamp(value: Date | null, code: string): string | undefined {
  if (value === null) return undefined;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(code);
  const parsed = parseStrictUtcTimestampV1(value.toISOString());
  if (!parsed.accepted) throw new Error(code);
  return parsed.value;
}

function rowToEntry(row: JobHistoryDatabaseRowV1): JobHistoryEntryV1 {
  const jobId = parseStableIdentifierV1(row.id);
  if (
    !jobId.accepted ||
    row.actionType.length < 1 ||
    row.actionType.length > 128 ||
    !Number.isSafeInteger(row.actionVersion) ||
    row.actionVersion < 1 ||
    !states.includes(row.state as JobHistoryStateV1) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  )
    throw new Error('JRA_PERSISTED_JOB_HISTORY_INVALID');
  const createdAt = timestamp(row.createdAt, 'JRA_PERSISTED_JOB_HISTORY_INVALID');
  if (createdAt === undefined) throw new Error('JRA_PERSISTED_JOB_HISTORY_INVALID');
  const startedAt = timestamp(row.startedAt, 'JRA_PERSISTED_JOB_HISTORY_INVALID');
  const finishedAt = timestamp(row.finishedAt, 'JRA_PERSISTED_JOB_HISTORY_INVALID');
  const state = row.state as JobHistoryStateV1;
  return Object.freeze({
    schemaVersion: 4 as const,
    jobId: jobId.value,
    actionType: row.actionType,
    actionVersion: row.actionVersion,
    state,
    revision: row.revision,
    createdAt,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
    resultAvailable: state === 'SUCCEEDED' || state === 'PARTIALLY_SUCCEEDED',
    approvalState:
      state === 'AWAITING_APPROVAL' || state === 'NEEDS_REVIEW' ? 'PENDING' : 'NOT_APPLICABLE',
  });
}

function decodeCursor(
  cursor: string | undefined,
): { readonly createdAt: Date; readonly id: string } | undefined {
  if (cursor === undefined) return undefined;
  if (!/^[A-Za-z0-9_-]{16,512}$/u.test(cursor)) throw new Error('JRA_HISTORY_CURSOR_INVALID');
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new Error('JRA_HISTORY_CURSOR_INVALID');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('JRA_HISTORY_CURSOR_INVALID');
  const record = value as Record<string, unknown>;
  const id = parseStableIdentifierV1(record['id']);
  const createdAt = parseStrictUtcTimestampV1(record['createdAt']);
  if (!id.accepted || !createdAt.accepted) throw new Error('JRA_HISTORY_CURSOR_INVALID');
  return Object.freeze({ createdAt: new Date(createdAt.value), id: id.value });
}

function encodeCursor(entry: JobHistoryEntryV1): string {
  return Buffer.from(
    JSON.stringify({ createdAt: entry.createdAt, id: entry.jobId }),
    'utf8',
  ).toString('base64url');
}

export class PrismaJobHistoryReadAdapter implements JobHistoryReadPortV1 {
  public constructor(private readonly client: JobHistoryDatabaseClientV1) {}

  public async list(
    context: IamTenantContextV1,
    query: JobHistoryListQueryV1,
  ): Promise<JobHistoryPageV1> {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100)
      throw new Error('JRA_HISTORY_LIMIT_INVALID');
    const cursor = decodeCursor(query.cursor);
    const where: Record<string, unknown> = scopeWhere(context.tenantScope);
    if (cursor !== undefined) {
      where['OR'] = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }
    const rows = await this.client.jobRecord.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const entries = rows.map((row) => {
      rowScope(row);
      return rowToEntry(row);
    });
    const items = entries.slice(0, query.limit);
    return Object.freeze({
      items: Object.freeze(items),
      ...(entries.length > query.limit
        ? { nextCursor: encodeCursor(items[items.length - 1] as JobHistoryEntryV1) }
        : {}),
    });
  }

  public async find(
    context: IamTenantContextV1,
    jobId: StableIdentifierV1,
  ): Promise<JobHistoryEntryV1 | undefined> {
    const row = await this.client.jobRecord.findFirst({
      where: { id: jobId, ...scopeWhere(context.tenantScope) },
    });
    if (row === null) return undefined;
    rowScope(row);
    return rowToEntry(row);
  }
}
