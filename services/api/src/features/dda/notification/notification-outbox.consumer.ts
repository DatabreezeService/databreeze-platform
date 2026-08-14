import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { DdaDatabaseClientV1 } from '../adapter/dda-database.client.js';
import type {
  NotificationOutboxScopePortV1,
  NotificationOutboxScopeV1,
} from './notification-outbox.worker.js';
import {
  NOTIFICATION_PROJECTION_CONSUMER_KEY_V1,
  NotificationProjectionConsumerV1,
  type CommittedNotificationEventV1,
  type NotificationProjectionCheckpointPortV1,
} from './notification-projection-consumer.js';
import type { DdaNotificationKind } from './dda-notification-policy.js';

export const DDA_NOTIFICATION_OUTBOX_CONSUMER = Symbol('DDA_NOTIFICATION_OUTBOX_CONSUMER');

const OUTBOX_PAGE_LIMIT = 50;

export interface OutboxCursorV1 {
  readonly occurredAt: string;
  readonly eventId: string;
}

export interface NotificationOutboxRecordV1 {
  readonly eventId: string;
  readonly eventHash: string;
  readonly occurredAt: string;
  readonly event?: CommittedNotificationEventV1;
}

export interface NotificationCommittedOutboxPortV1 {
  list(input: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly after?: OutboxCursorV1;
    readonly limit: number;
  }): Promise<
    | { readonly accepted: true; readonly records: readonly NotificationOutboxRecordV1[] }
    | { readonly accepted: false; readonly code: 'UNAVAILABLE' }
  >;
}

type RefreshEventRowV1 = {
  readonly eventId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly dashboardId: string;
  readonly freshnessState: string;
  readonly eventKind: string;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly eventHash: string;
};

function notificationKind(row: RefreshEventRowV1): DdaNotificationKind | undefined {
  if (row.eventKind === 'SNAPSHOT_COMMITTED') return undefined;
  if (row.eventKind === 'REFRESH_BLOCKED') return 'REFRESH_BLOCKED';
  if (row.eventKind === 'REFRESH_FAILED') return 'SYNC_FAILED';
  if (row.eventKind === 'FRESHNESS_CHANGED') {
    if (row.freshnessState === 'BLOCKED') return 'REFRESH_BLOCKED';
    if (row.freshnessState === 'SOURCE_UNAVAILABLE') return 'SOURCE_MISMATCH';
    if (row.freshnessState === 'STALE' || row.freshnessState === 'PENDING') return 'SYNC_FAILED';
    return undefined;
  }
  return undefined;
}

function unresolvedFor(row: RefreshEventRowV1): boolean {
  return row.freshnessState !== 'FRESH';
}

function toRecord(
  row: RefreshEventRowV1,
  scope: { readonly organizationId: string; readonly workspaceId: string },
): NotificationOutboxRecordV1 | undefined {
  if (
    row.organizationId !== scope.organizationId ||
    row.workspaceId !== scope.workspaceId ||
    row.scopeType !== 'project' ||
    !parseStableIdentifierV1(row.eventId).accepted ||
    !parseStableIdentifierV1(row.organizationId).accepted ||
    !parseStableIdentifierV1(row.workspaceId).accepted ||
    !parseStableIdentifierV1(row.projectId).accepted ||
    !parseStableIdentifierV1(row.dashboardId).accepted ||
    !parseStableIdentifierV1(row.correlationId).accepted ||
    !/^[a-f0-9]{64}$/u.test(row.eventHash) ||
    !Number.isFinite(row.occurredAt.getTime()) ||
    !parseStrictUtcTimestampV1(row.occurredAt.toISOString()).accepted
  ) {
    return undefined;
  }
  const kind = notificationKind(row);
  return Object.freeze({
    eventId: row.eventId,
    eventHash: row.eventHash,
    occurredAt: row.occurredAt.toISOString(),
    ...(kind === undefined
      ? {}
      : {
          event: Object.freeze({
            committed: true as const,
            tenantScope: {
              scopeType: 'workspace' as const,
              organizationId: row.organizationId,
              workspaceId: row.workspaceId,
            },
            eventId: row.eventId,
            eventHash: row.eventHash,
            subjectId: row.dashboardId,
            kind,
            unresolved: unresolvedFor(row),
            createdAt: row.occurredAt.toISOString(),
            correlationId: row.correlationId,
          }),
        }),
  });
}

function afterWhere(after: OutboxCursorV1 | undefined): Record<string, unknown> | undefined {
  if (after === undefined) return undefined;
  return {
    OR: [
      { occurredAt: { gt: new Date(after.occurredAt) } },
      { occurredAt: new Date(after.occurredAt), eventId: { gt: after.eventId } },
    ],
  };
}

function validOutboxRecord(
  record: NotificationOutboxRecordV1,
  organizationId: string,
  workspaceId: string,
): boolean {
  if (
    typeof record !== 'object' ||
    record === null ||
    typeof record.eventId !== 'string' ||
    !parseStableIdentifierV1(record.eventId).accepted ||
    typeof record.eventHash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(record.eventHash) ||
    typeof record.occurredAt !== 'string' ||
    !parseStrictUtcTimestampV1(record.occurredAt).accepted
  ) {
    return false;
  }
  if (record.event === undefined) return true;
  const event = record.event;
  if (typeof event !== 'object' || event === null) return false;
  const tenantScope = event.tenantScope;
  return (
    event.committed === true &&
    event.eventId === record.eventId &&
    event.eventHash === record.eventHash &&
    event.createdAt === record.occurredAt &&
    typeof tenantScope === 'object' &&
    tenantScope !== null &&
    tenantScope.scopeType === 'workspace' &&
    tenantScope.organizationId === organizationId &&
    tenantScope.workspaceId === workspaceId
  );
}

function isOutboxRecordArray(value: unknown): value is readonly NotificationOutboxRecordV1[] {
  return Array.isArray(value);
}

/** Reads the existing content-safe committed DDA event outbox through a narrow database port. */
export class PrismaNotificationCommittedOutboxAdapter
  implements NotificationCommittedOutboxPortV1, NotificationOutboxScopePortV1
{
  public constructor(private readonly client: DdaDatabaseClientV1) {}

  public async listPendingScopes(input: {
    readonly limit: number;
  }): Promise<
    | { readonly accepted: true; readonly scopes: readonly NotificationOutboxScopeV1[] }
    | { readonly accepted: false; readonly code: 'UNAVAILABLE' }
  > {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 64) {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
    try {
      const rows = await this.client.dashboardRefreshEventRecord.findMany({
        where: {},
        orderBy: { occurredAt: 'asc' },
        take: input.limit * 4,
      });
      const scopes: NotificationOutboxScopeV1[] = [];
      const seen = new Set<string>();
      for (const row of rows as readonly RefreshEventRowV1[]) {
        const record = toRecord(row, {
          organizationId: row.organizationId,
          workspaceId: row.workspaceId,
        });
        if (record === undefined) return { accepted: false, code: 'UNAVAILABLE' };
        const key = `${row.organizationId}:${row.workspaceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        scopes.push({
          organizationId: row.organizationId,
          workspaceId: row.workspaceId,
        });
        if (scopes.length === input.limit) break;
      }
      return { accepted: true, scopes: Object.freeze(scopes) };
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }

  public async list(input: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly after?: OutboxCursorV1;
    readonly limit: number;
  }): Promise<
    | { readonly accepted: true; readonly records: readonly NotificationOutboxRecordV1[] }
    | { readonly accepted: false; readonly code: 'UNAVAILABLE' }
  > {
    if (
      !parseStableIdentifierV1(input.organizationId).accepted ||
      !parseStableIdentifierV1(input.workspaceId).accepted ||
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > OUTBOX_PAGE_LIMIT ||
      (input.after !== undefined &&
        (!parseStableIdentifierV1(input.after.eventId).accepted ||
          !parseStrictUtcTimestampV1(input.after.occurredAt).accepted))
    ) {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
    try {
      const rows = await this.client.dashboardRefreshEventRecord.findMany({
        where: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          ...(afterWhere(input.after) ?? {}),
        },
        orderBy: { occurredAt: 'asc' },
        take: input.limit + 1,
      });
      const ordered = [...(rows as readonly RefreshEventRowV1[])].sort(
        (left, right) =>
          left.occurredAt.getTime() - right.occurredAt.getTime() ||
          left.eventId.localeCompare(right.eventId),
      );
      const records: NotificationOutboxRecordV1[] = [];
      for (const row of ordered) {
        const record = toRecord(row, input);
        if (record === undefined) return { accepted: false, code: 'UNAVAILABLE' };
        records.push(record);
      }
      return { accepted: true, records: Object.freeze(records) };
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }
}

export type NotificationOutboxConsumerResultV1 =
  | {
      readonly accepted: true;
      readonly consumedCount: number;
      readonly deliveredCount: number;
      readonly hasMore: boolean;
    }
  | { readonly accepted: false; readonly code: 'CONFLICT' | 'UNAVAILABLE' };

/**
 * Reconciles committed outbox rows in order. Routine committed refresh rows
 * advance the notification checkpoint without emitting a notification; all
 * other rows go through the recipient-authorized projection consumer.
 */
export class NotificationOutboxConsumerV1 {
  public constructor(
    private readonly outbox: NotificationCommittedOutboxPortV1,
    private readonly projection: NotificationProjectionConsumerV1,
    private readonly checkpoints: NotificationProjectionCheckpointPortV1,
    private readonly consumerKey = NOTIFICATION_PROJECTION_CONSUMER_KEY_V1,
  ) {}

  public async consumePending(input: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly limit?: number;
  }): Promise<NotificationOutboxConsumerResultV1> {
    const limit = input.limit ?? OUTBOX_PAGE_LIMIT;
    if (
      !parseStableIdentifierV1(input.organizationId).accepted ||
      !parseStableIdentifierV1(input.workspaceId).accepted ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > OUTBOX_PAGE_LIMIT
    ) {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
    let checkpoint;
    try {
      checkpoint = await this.checkpoints.getCheckpoint({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        consumerKey: this.consumerKey,
      });
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
    const page = await this.outbox.list({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      limit,
      ...(checkpoint === null
        ? {}
        : {
            after: {
              occurredAt: checkpoint.lastOccurredAt,
              eventId: checkpoint.lastEventId,
            },
          }),
    });
    if (page.accepted === false) return { accepted: false, code: 'UNAVAILABLE' };
    const records: unknown = page.records;
    if (
      !isOutboxRecordArray(records) ||
      records.length > limit + 1 ||
      records.some((record) => !validOutboxRecord(record, input.organizationId, input.workspaceId))
    ) {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
    let consumedCount = 0;
    let deliveredCount = 0;
    for (const record of records.slice(0, limit)) {
      if (record.event === undefined) {
        const advanced = await this.checkpoints.advanceCheckpoint({
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          consumerKey: this.consumerKey,
          lastEventId: record.eventId,
          lastEventHash: record.eventHash,
          lastOccurredAt: record.occurredAt,
        });
        if (advanced.accepted === false) return { accepted: false, code: advanced.code };
      } else {
        const projected = await this.projection.consume(record.event);
        if (projected.accepted === false) {
          return {
            accepted: false,
            code: projected.code === 'CONFLICT' ? 'CONFLICT' : 'UNAVAILABLE',
          };
        }
        deliveredCount += projected.deliveredCount;
      }
      consumedCount += 1;
    }
    return {
      accepted: true,
      consumedCount,
      deliveredCount,
      hasMore: records.length > limit,
    };
  }

  public runOnce(input: Parameters<NotificationOutboxConsumerV1['consumePending']>[0]) {
    return this.consumePending(input);
  }
}
