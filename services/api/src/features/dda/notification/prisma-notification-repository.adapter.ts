import { createHash, randomUUID } from 'node:crypto';

import {
  parseV3Contract,
  type DdaNotification,
  type DdaNotificationPage,
} from '@databreeze/contracts/v3';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  DdaDatabaseClientV1,
  DdaNotificationIntentRowV1,
  DdaNotificationProjectionCheckpointRowV1,
  DdaNotificationStateCommandReceiptRowV1,
} from '../adapter/dda-database.client.js';
import {
  type NotificationIntentInputV1,
  type NotificationRepositoryPortV1,
  type NotificationRepositoryResultV1,
  type NotificationStateV1,
  type NotificationTenantContextV1,
} from './notification-repository.port.js';
import { fingerprintNotificationStateCommandV1 } from './notification-state-command.port.js';
import type {
  NotificationStateCommandInputV1,
  NotificationStateCommandPortV1,
} from './notification-state-command.port.js';
import type {
  NotificationProjectionCheckpointV1,
  NotificationProjectionCheckpointPortV1,
} from './notification-projection-consumer.js';

const NOTIFICATION_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v3/dda-notification' as const;
const PAGE_SCHEMA_ID = 'https://schemas.databreeze.dev/contracts/v3/dda-notification-page' as const;
const MAX_LABEL_LENGTH = 160;
const CURSOR_PATTERN = /^cursor-v1-[A-Za-z0-9_-]{1,480}$/u;
const FORBIDDEN_CONTENT_PATTERN =
  /(?:https?:\/\/|\\\\|\b(?:password|passwd|secret|credential|api[-_ ]?key|access[-_ ]?token|provider|openai|anthropic)\b|^[A-Za-z]:[\\/])/iu;

interface CursorValue {
  readonly createdAt: string;
  readonly id: string;
}

function rejected<TValue>(
  code: 'INVALID_CURSOR' | 'NOT_FOUND' | 'CONFLICT' | 'UNAVAILABLE',
): NotificationRepositoryResultV1<TValue> {
  return Object.freeze({ accepted: false as const, code });
}

function accepted<TValue>(value: TValue): NotificationRepositoryResultV1<TValue> {
  return Object.freeze({ accepted: true as const, value });
}

function encodeCursor(value: CursorValue): string {
  return `cursor-v1-${Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')}`;
}

function decodeCursor(value: string | undefined): CursorValue | undefined | 'INVALID' {
  if (value === undefined) return undefined;
  if (!CURSOR_PATTERN.test(value)) return 'INVALID';
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value.slice('cursor-v1-'.length), 'base64url').toString('utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 'INVALID';
    const record = parsed as Record<string, unknown>;
    if (
      typeof record['createdAt'] !== 'string' ||
      typeof record['id'] !== 'string' ||
      !parseStrictUtcTimestampV1(record['createdAt']).accepted ||
      !parseStableIdentifierV1(record['id']).accepted
    ) {
      return 'INVALID';
    }
    const canonical = encodeCursor({ createdAt: record['createdAt'], id: record['id'] });
    return canonical === value ? { createdAt: record['createdAt'], id: record['id'] } : 'INVALID';
  } catch {
    return 'INVALID';
  }
}

function safeText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_LABEL_LENGTH &&
    value.trim() === value &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    }) &&
    !FORBIDDEN_CONTENT_PATTERN.test(value)
  );
}

function safeTimestamp(value: unknown): value is string {
  return typeof value === 'string' && parseStrictUtcTimestampV1(value).accepted;
}

function safeDate(value: unknown): value is Date {
  return (
    value instanceof Date && Number.isFinite(value.getTime()) && safeTimestamp(value.toISOString())
  );
}

function safeRow(row: DdaNotificationIntentRowV1): boolean {
  const state = row.state;
  const dismissed = row.dismissedAt;
  const firstOccurredAt = safeDate(row.firstOccurredAt) ? row.firstOccurredAt : undefined;
  const lastOccurredAt = safeDate(row.lastOccurredAt) ? row.lastOccurredAt : undefined;
  const bundleWindowStart = safeDate(row.bundleWindowStart) ? row.bundleWindowStart : undefined;
  return (
    parseStableIdentifierV1(row.id).accepted &&
    parseStableIdentifierV1(row.eventId).accepted &&
    parseStableIdentifierV1(row.organizationId).accepted &&
    parseStableIdentifierV1(row.workspaceId).accepted &&
    parseStableIdentifierV1(row.recipientId).accepted &&
    parseStableIdentifierV1(row.subjectId).accepted &&
    parseStableIdentifierV1(row.correlationId).accepted &&
    typeof row.eventHash === 'string' &&
    /^[a-f0-9]{64}$/u.test(row.eventHash) &&
    safeText(row.labelVi) &&
    safeText(row.labelEn) &&
    safeDate(row.createdAt) &&
    typeof row.bundleKey === 'string' &&
    /^[a-f0-9]{64}$/u.test(row.bundleKey) &&
    bundleWindowStart !== undefined &&
    firstOccurredAt !== undefined &&
    lastOccurredAt !== undefined &&
    firstOccurredAt.getTime() <= lastOccurredAt.getTime() &&
    bundleWindowStart.getTime() <= lastOccurredAt.getTime() &&
    Number.isSafeInteger(row.occurrenceCount) &&
    row.occurrenceCount >= 1 &&
    Number.isSafeInteger(row.revision) &&
    row.revision >= 1 &&
    ['UNREAD', 'READ', 'ARCHIVED', 'DISMISSED'].includes(state) &&
    (state === 'DISMISSED') === (dismissed !== null) &&
    (dismissed === null || safeDate(dismissed)) &&
    [
      'REVIEW_REQUIRED',
      'PREPARATION_BLOCKED',
      'SOURCE_MISMATCH',
      'SYNC_FAILED',
      'REFRESH_BLOCKED',
      'OCR_REVIEW_REQUIRED',
      'AGENT_BUDGET_DENIED',
      'SECURITY_NOTICE',
    ].includes(row.kind) &&
    ['OPEN_DASHBOARDS', 'OPEN_ANALYSIS', 'OPEN_DATA', 'OPEN_INBOX', 'OPEN_SETTINGS'].includes(
      row.action,
    )
  );
}

function publicRecord(row: DdaNotificationIntentRowV1): DdaNotification | undefined {
  if (!safeRow(row)) return undefined;
  const publicValue = {
    schemaVersion: 3 as const,
    id: row.id,
    workspaceId: row.workspaceId,
    subjectId: row.subjectId,
    kind: row.kind,
    labelVi: row.labelVi,
    labelEn: row.labelEn,
    action: row.action,
    createdAt: row.createdAt.toISOString(),
    correlationId: row.correlationId,
    state: row.state,
    revision: row.revision,
  };
  const parsed = parseV3Contract<DdaNotification>(NOTIFICATION_SCHEMA_ID, publicValue);
  return parsed.accepted ? Object.freeze(parsed.value) : undefined;
}

function rowScopeMatches(
  context: NotificationTenantContextV1,
  row: DdaNotificationIntentRowV1,
): boolean {
  const tenantScope = context.tenantScope;
  return (
    tenantScope.scopeType === 'workspace' &&
    row.organizationId === tenantScope.organizationId &&
    row.workspaceId === tenantScope.workspaceId &&
    row.recipientId === context.actorId
  );
}

interface NotificationScopeColumns {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly recipientId: string;
}

function scopeWhere(context: NotificationTenantContextV1): NotificationScopeColumns | undefined {
  if (
    context.tenantScope.scopeType !== 'workspace' ||
    context.tenantScope.workspaceId === undefined
  )
    return undefined;
  return {
    organizationId: context.tenantScope.organizationId,
    workspaceId: context.tenantScope.workspaceId,
    recipientId: context.actorId,
  };
}

function asDate(value: string): Date | undefined {
  if (!safeTimestamp(value)) return undefined;
  return new Date(value);
}

function isP2002(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { readonly code?: unknown }).code === 'P2002'
  );
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

function isSafeKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    !hasControlCharacters(value)
  );
}

function proofMatches(
  context: NotificationTenantContextV1,
  input: NotificationIntentInputV1,
): boolean {
  const proof = input.authorizationProof;
  return (
    proof !== undefined &&
    context.actorId === input.recipientId &&
    proof.organizationId === context.tenantScope.organizationId &&
    proof.workspaceId === input.workspaceId &&
    proof.recipientId === input.recipientId &&
    proof.subjectId === input.subjectId &&
    proof.eventId === input.eventId &&
    Number.isSafeInteger(proof.authorizationEpoch) &&
    proof.authorizationEpoch > 0 &&
    typeof proof.token === 'string' &&
    proof.token.length > 0 &&
    proof.token.length <= 256 &&
    !hasControlCharacters(proof.token)
  );
}

function defaultBundleKey(input: NotificationIntentInputV1, organizationId: string): string {
  return digest(
    `${organizationId}|${input.workspaceId}|${input.recipientId}|${input.subjectId}|${input.kind}|${input.eventId}`,
  );
}

function resultDocument(value: DdaNotification): { readonly notification: DdaNotification } {
  return Object.freeze({ notification: Object.freeze({ ...value }) });
}

function resultFromDocument(value: unknown): DdaNotification | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const notification = (value as Record<string, unknown>)['notification'];
  const parsed = parseV3Contract<DdaNotification>(NOTIFICATION_SCHEMA_ID, notification);
  return parsed.accepted ? Object.freeze(parsed.value) : undefined;
}

function validReceipt(row: DdaNotificationStateCommandReceiptRowV1): boolean {
  return (
    parseStableIdentifierV1(row.id).accepted &&
    parseStableIdentifierV1(row.organizationId).accepted &&
    parseStableIdentifierV1(row.workspaceId).accepted &&
    parseStableIdentifierV1(row.recipientId).accepted &&
    parseStableIdentifierV1(row.notificationId).accepted &&
    Number.isSafeInteger(row.expectedRevision) &&
    row.expectedRevision > 0 &&
    ['READ', 'ARCHIVED', 'DISMISSED'].includes(row.targetState) &&
    isSafeKey(row.idempotencyKey) &&
    typeof row.fingerprint === 'string' &&
    /^[a-f0-9]{64}$/u.test(row.fingerprint) &&
    resultFromDocument(row.resultDocument) !== undefined &&
    row.createdAt instanceof Date &&
    Number.isFinite(row.createdAt.getTime())
  );
}

function receiptMatches(
  row: DdaNotificationStateCommandReceiptRowV1,
  input: NotificationStateCommandInputV1,
): boolean {
  return (
    row.organizationId === input.context.tenantScope.organizationId &&
    row.workspaceId === input.context.tenantScope.workspaceId &&
    row.recipientId === input.context.actorId &&
    row.notificationId === input.notificationId &&
    row.expectedRevision === input.expectedRevision &&
    row.targetState === input.targetState &&
    row.idempotencyKey === input.idempotencyKey &&
    row.fingerprint === input.fingerprint
  );
}

function projectionCheckpointIsValid(row: DdaNotificationProjectionCheckpointRowV1): boolean {
  return (
    parseStableIdentifierV1(row.organizationId).accepted &&
    parseStableIdentifierV1(row.workspaceId).accepted &&
    isSafeKey(row.consumerKey) &&
    parseStableIdentifierV1(row.lastEventId).accepted &&
    typeof row.lastEventHash === 'string' &&
    /^[a-f0-9]{64}$/u.test(row.lastEventHash) &&
    safeDate(row.lastOccurredAt) &&
    Number.isSafeInteger(row.revision) &&
    row.revision > 0 &&
    safeDate(row.updatedAt)
  );
}

function canAdvance(
  current: NotificationStateV1,
  next: Exclude<NotificationStateV1, 'UNREAD'>,
): boolean {
  if (current === 'DISMISSED') return false;
  if (next === 'DISMISSED') return true;
  const rank = { UNREAD: 0, READ: 1, ARCHIVED: 2 } as const;
  const currentRank =
    current === 'UNREAD' ? rank.UNREAD : current === 'READ' ? rank.READ : rank.ARCHIVED;
  return rank[next] > currentRank;
}

/** Durable notification intent and state adapter. It exposes only content-safe public records. */
export class PrismaNotificationRepositoryAdapter
  implements
    NotificationRepositoryPortV1,
    NotificationStateCommandPortV1,
    NotificationProjectionCheckpointPortV1
{
  private readonly client: DdaDatabaseClientV1;

  public constructor(client: DdaDatabaseClientV1) {
    this.client = client;
  }

  public async createIntent(
    context: NotificationTenantContextV1,
    input: NotificationIntentInputV1,
  ): Promise<NotificationRepositoryResultV1<DdaNotification>> {
    const scope = scopeWhere(context);
    const createdAt = asDate(input.createdAt);
    const firstOccurredAt = asDate(input.firstOccurredAt ?? input.createdAt);
    const lastOccurredAt = asDate(input.lastOccurredAt ?? input.createdAt);
    const bundleWindowStart = asDate(input.bundleWindowStart ?? input.createdAt);
    const bundleKey =
      input.bundleKey ?? defaultBundleKey(input, context.tenantScope.organizationId);
    if (
      scope === undefined ||
      scope.workspaceId !== input.workspaceId ||
      !proofMatches(context, input) ||
      createdAt === undefined ||
      firstOccurredAt === undefined ||
      lastOccurredAt === undefined ||
      bundleWindowStart === undefined ||
      !parseStableIdentifierV1(input.notificationId).accepted ||
      !parseStableIdentifierV1(input.eventId).accepted ||
      !parseStableIdentifierV1(input.recipientId).accepted ||
      !parseStableIdentifierV1(input.subjectId).accepted ||
      !parseStableIdentifierV1(input.correlationId).accepted ||
      !/^[a-f0-9]{64}$/u.test(input.eventHash) ||
      !/^[a-f0-9]{64}$/u.test(bundleKey) ||
      bundleWindowStart.getTime() > lastOccurredAt.getTime()
    ) {
      return rejected('UNAVAILABLE');
    }
    const receiptWhere = {
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      recipientId: input.recipientId,
      eventId: input.eventId,
    };
    try {
      return await this.client.$transaction(async (transaction) => {
        const receipt = await transaction.ddaNotificationProjectionReceipt.findFirst({
          where: receiptWhere,
        });
        if (receipt !== null) {
          if (
            receipt.eventHash !== input.eventHash ||
            receipt.notificationId !== input.notificationId ||
            receipt.bundleKey !== bundleKey
          )
            return rejected('CONFLICT');
          const replay = await transaction.ddaNotificationIntent.findFirst({
            where: {
              organizationId: scope.organizationId,
              workspaceId: scope.workspaceId,
              recipientId: input.recipientId,
              id: receipt.notificationId,
            },
          });
          if (replay === null) return rejected('UNAVAILABLE');
          const value = publicRecord(replay);
          return value === undefined ? rejected('UNAVAILABLE') : accepted(value);
        }

        const existingBundle = await transaction.ddaNotificationIntent.findFirst({
          where: {
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            recipientId: input.recipientId,
            bundleKey,
          },
        });
        let row: DdaNotificationIntentRowV1;
        if (existingBundle !== null) {
          if (
            existingBundle.id !== input.notificationId ||
            !safeRow(existingBundle) ||
            existingBundle.subjectId !== input.subjectId ||
            existingBundle.kind !== input.kind ||
            existingBundle.bundleWindowStart.getTime() !== bundleWindowStart.getTime()
          )
            return rejected('CONFLICT');
          const nextFirst =
            existingBundle.firstOccurredAt.getTime() <= firstOccurredAt.getTime()
              ? existingBundle.firstOccurredAt
              : firstOccurredAt;
          const nextLast =
            existingBundle.lastOccurredAt.getTime() >= lastOccurredAt.getTime()
              ? existingBundle.lastOccurredAt
              : lastOccurredAt;
          const updated = await transaction.ddaNotificationIntent.updateMany({
            where: {
              organizationId: scope.organizationId,
              workspaceId: scope.workspaceId,
              recipientId: input.recipientId,
              id: existingBundle.id,
              bundleKey,
              revision: existingBundle.revision,
            },
            data: {
              eventId: input.eventId,
              eventHash: input.eventHash,
              createdAt,
              occurrenceCount: existingBundle.occurrenceCount + 1,
              firstOccurredAt: nextFirst,
              lastOccurredAt: nextLast,
            },
          });
          if (updated.count !== 1) return rejected('CONFLICT');
          const updatedRow = await transaction.ddaNotificationIntent.findFirst({
            where: {
              organizationId: scope.organizationId,
              workspaceId: scope.workspaceId,
              recipientId: input.recipientId,
              id: existingBundle.id,
            },
          });
          if (updatedRow === null) return rejected('UNAVAILABLE');
          row = updatedRow;
        } else {
          const data = {
            id: input.notificationId,
            eventId: input.eventId,
            eventHash: input.eventHash,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            recipientId: input.recipientId,
            subjectId: input.subjectId,
            kind: input.kind,
            action: input.action,
            labelVi: input.labelVi,
            labelEn: input.labelEn,
            createdAt,
            correlationId: input.correlationId,
            occurrenceCount: input.occurrenceCount ?? 1,
            firstOccurredAt,
            lastOccurredAt,
            bundleKey,
            bundleWindowStart,
            state: 'UNREAD' as const,
            revision: 1,
            dismissedAt: null,
          };
          if (!safeRow(data)) return rejected('UNAVAILABLE');
          row = await transaction.ddaNotificationIntent.create({ data });
        }
        await transaction.ddaNotificationProjectionReceipt.create({
          data: {
            id: randomUUID(),
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            recipientId: input.recipientId,
            eventId: input.eventId,
            eventHash: input.eventHash,
            notificationId: row.id,
            bundleKey,
            createdAt: new Date(),
          },
        });
        const value = publicRecord(row);
        return value === undefined ? rejected('UNAVAILABLE') : accepted(value);
      });
    } catch (error) {
      if (!isP2002(error)) return rejected('UNAVAILABLE');
      try {
        const concurrent = await this.client.ddaNotificationProjectionReceipt.findFirst({
          where: receiptWhere,
        });
        if (concurrent === null) return rejected('CONFLICT');
        if (
          concurrent.eventHash !== input.eventHash ||
          concurrent.notificationId !== input.notificationId ||
          concurrent.bundleKey !== bundleKey
        )
          return rejected('CONFLICT');
        const replay = await this.client.ddaNotificationIntent.findFirst({
          where: {
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            recipientId: input.recipientId,
            id: concurrent.notificationId,
          },
        });
        if (replay === null) return rejected('UNAVAILABLE');
        const value = publicRecord(replay);
        return value === undefined ? rejected('UNAVAILABLE') : accepted(value);
      } catch {
        return rejected('UNAVAILABLE');
      }
    }
  }

  public async list(
    context: NotificationTenantContextV1,
    input: { readonly limit: number; readonly cursor?: string },
  ): Promise<NotificationRepositoryResultV1<DdaNotificationPage>> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50)
      return rejected('INVALID_CURSOR');
    const scope = scopeWhere(context);
    if (scope === undefined) return rejected('UNAVAILABLE');
    const decoded = decodeCursor(input.cursor);
    if (decoded === 'INVALID') return rejected('INVALID_CURSOR');
    const where: Record<string, unknown> = { ...scope };
    if (decoded !== undefined) {
      where['OR'] = [
        { createdAt: { lt: new Date(decoded.createdAt) } },
        { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
      ];
    }
    try {
      const rows = await this.client.ddaNotificationIntent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
      });
      for (const row of rows) {
        if (!rowScopeMatches(context, row) || !safeRow(row)) return rejected('UNAVAILABLE');
      }
      const values: DdaNotification[] = [];
      for (const row of rows.slice(0, input.limit)) {
        const value = publicRecord(row);
        if (value === undefined) return rejected('UNAVAILABLE');
        values.push(value);
      }
      const unreadCount = await this.client.ddaNotificationIntent.count({
        where: { ...scope, state: 'UNREAD' },
      });
      if (!Number.isSafeInteger(unreadCount) || unreadCount < 0) return rejected('UNAVAILABLE');
      const last = rows[input.limit - 1];
      const nextCursor =
        rows.length > input.limit && last !== undefined
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : undefined;
      const page = {
        schemaVersion: 3 as const,
        items: Object.freeze(values),
        unreadCount,
        ...(nextCursor === undefined ? {} : { nextCursor }),
      };
      const parsed = parseV3Contract<DdaNotificationPage>(PAGE_SCHEMA_ID, page);
      return parsed.accepted ? accepted(Object.freeze(parsed.value)) : rejected('UNAVAILABLE');
    } catch {
      return rejected('UNAVAILABLE');
    }
  }

  public async setStateCommand(
    input: NotificationStateCommandInputV1,
  ): Promise<NotificationRepositoryResultV1<DdaNotification>> {
    const scope = scopeWhere(input.context);
    if (
      scope === undefined ||
      !parseStableIdentifierV1(input.notificationId).accepted ||
      !['READ', 'ARCHIVED', 'DISMISSED'].includes(input.targetState) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1 ||
      !isSafeKey(input.idempotencyKey) ||
      typeof input.fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(input.fingerprint)
    )
      return rejected('CONFLICT');

    const receiptWhere = {
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      recipientId: input.context.actorId,
      notificationId: input.notificationId,
      idempotencyKey: input.idempotencyKey,
    };
    try {
      return await this.client.$transaction(async (transaction) => {
        const existingReceipt = await transaction.ddaNotificationStateCommandReceipt.findFirst({
          where: receiptWhere,
        });
        if (existingReceipt !== null) {
          if (!validReceipt(existingReceipt)) return rejected('UNAVAILABLE');
          if (!receiptMatches(existingReceipt, input)) return rejected('CONFLICT');
          const replay = resultFromDocument(existingReceipt.resultDocument);
          return replay === undefined ? rejected('UNAVAILABLE') : accepted(replay);
        }

        const current = await transaction.ddaNotificationIntent.findFirst({
          where: { ...scope, id: input.notificationId },
        });
        if (current === null) return rejected('NOT_FOUND');
        if (!safeRow(current)) return rejected('UNAVAILABLE');
        const currentValue = publicRecord(current);
        if (currentValue === undefined) return rejected('UNAVAILABLE');
        const currentState = current.state as NotificationStateV1;
        let result: DdaNotification;
        if (currentState === input.targetState && current.revision === input.expectedRevision) {
          result = currentValue;
        } else {
          if (
            current.revision !== input.expectedRevision ||
            !canAdvance(currentState, input.targetState)
          )
            return rejected('CONFLICT');
          const updated = await transaction.ddaNotificationIntent.updateMany({
            where: {
              ...scope,
              id: input.notificationId,
              revision: input.expectedRevision,
              state: currentState,
            },
            data: {
              state: input.targetState,
              revision: input.expectedRevision + 1,
              dismissedAt: input.targetState === 'DISMISSED' ? new Date() : null,
            },
          });
          if (updated.count !== 1) return rejected('CONFLICT');
          const saved = await transaction.ddaNotificationIntent.findFirst({
            where: { ...scope, id: input.notificationId },
          });
          if (saved === null) return rejected('UNAVAILABLE');
          const value = publicRecord(saved);
          if (value === undefined) return rejected('UNAVAILABLE');
          result = value;
        }

        await transaction.ddaNotificationStateCommandReceipt.create({
          data: {
            id: randomUUID(),
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            recipientId: input.context.actorId,
            notificationId: input.notificationId,
            expectedRevision: input.expectedRevision,
            targetState: input.targetState,
            idempotencyKey: input.idempotencyKey,
            fingerprint: input.fingerprint,
            resultDocument: resultDocument(result),
            createdAt: new Date(),
          },
        });
        return accepted(result);
      });
    } catch (error) {
      if (!isP2002(error)) return rejected('UNAVAILABLE');
      try {
        const raced = await this.client.ddaNotificationStateCommandReceipt.findFirst({
          where: receiptWhere,
        });
        if (raced === null || !validReceipt(raced)) return rejected('UNAVAILABLE');
        if (!receiptMatches(raced, input)) return rejected('CONFLICT');
        const replay = resultFromDocument(raced.resultDocument);
        return replay === undefined ? rejected('UNAVAILABLE') : accepted(replay);
      } catch {
        return rejected('UNAVAILABLE');
      }
    }
  }

  public async setState(
    context: NotificationTenantContextV1,
    input: {
      readonly notificationId: string;
      readonly state: Exclude<NotificationStateV1, 'UNREAD'>;
      readonly expectedRevision: number;
      readonly idempotencyKey?: string;
    },
  ): Promise<NotificationRepositoryResultV1<DdaNotification>> {
    const idempotencyKey: string =
      input.idempotencyKey ??
      `legacy:${input.notificationId}:${input.expectedRevision}:${input.state}`;
    const legacyInput: NotificationStateCommandInputV1 = {
      context,
      notificationId: input.notificationId,
      targetState: input.state,
      expectedRevision: input.expectedRevision,
      idempotencyKey,
      fingerprint: fingerprintNotificationStateCommandV1({
        context,
        notificationId: input.notificationId,
        targetState: input.state,
        expectedRevision: input.expectedRevision,
        idempotencyKey,
      }),
    };
    return this.setStateCommand(legacyInput);
  }

  public async getCheckpoint(input: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly consumerKey: string;
  }): Promise<NotificationProjectionCheckpointV1 | null> {
    const row = await this.client.ddaNotificationProjectionCheckpoint.findFirst({
      where: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        consumerKey: input.consumerKey,
      },
    });
    if (row === null) return null;
    if (!projectionCheckpointIsValid(row))
      throw new Error('DDA_PERSISTED_NOTIFICATION_CHECKPOINT_INVALID');
    return {
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      consumerKey: row.consumerKey,
      lastEventId: row.lastEventId,
      lastEventHash: row.lastEventHash,
      lastOccurredAt: row.lastOccurredAt.toISOString(),
    };
  }

  public async advanceCheckpoint(
    input: NotificationProjectionCheckpointV1,
  ): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly code: 'CONFLICT' | 'UNAVAILABLE' }
  > {
    if (
      !parseStableIdentifierV1(input.organizationId).accepted ||
      !parseStableIdentifierV1(input.workspaceId).accepted ||
      !isSafeKey(input.consumerKey) ||
      !parseStableIdentifierV1(input.lastEventId).accepted ||
      !/^[a-f0-9]{64}$/u.test(input.lastEventHash) ||
      asDate(input.lastOccurredAt) === undefined
    )
      return { accepted: false, code: 'UNAVAILABLE' };
    try {
      return await this.client.$transaction(async (transaction) => {
        const where = {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          consumerKey: input.consumerKey,
        };
        const current = await transaction.ddaNotificationProjectionCheckpoint.findFirst({ where });
        if (current !== null) {
          if (!projectionCheckpointIsValid(current))
            return { accepted: false as const, code: 'UNAVAILABLE' as const };
          const order =
            input.lastOccurredAt.localeCompare(current.lastOccurredAt.toISOString()) ||
            input.lastEventId.localeCompare(current.lastEventId);
          if (order < 0) return { accepted: true as const };
          if (order === 0) {
            return current.lastEventHash === input.lastEventHash
              ? { accepted: true as const }
              : { accepted: false as const, code: 'CONFLICT' as const };
          }
          const updated = await transaction.ddaNotificationProjectionCheckpoint.updateMany({
            where: { ...where, revision: current.revision },
            data: {
              lastEventId: input.lastEventId,
              lastEventHash: input.lastEventHash,
              lastOccurredAt: new Date(input.lastOccurredAt),
              revision: current.revision + 1,
            },
          });
          return updated.count === 1
            ? { accepted: true as const }
            : { accepted: false as const, code: 'UNAVAILABLE' as const };
        }
        await transaction.ddaNotificationProjectionCheckpoint.upsert({
          where: { organizationId_workspaceId_consumerKey: where },
          create: {
            ...where,
            lastEventId: input.lastEventId,
            lastEventHash: input.lastEventHash,
            lastOccurredAt: new Date(input.lastOccurredAt),
            revision: 1,
            updatedAt: new Date(),
          },
          update: {},
        });
        return { accepted: true as const };
      });
    } catch (error) {
      return isP2002(error)
        ? { accepted: false as const, code: 'CONFLICT' as const }
        : { accepted: false as const, code: 'UNAVAILABLE' as const };
    }
  }
}
