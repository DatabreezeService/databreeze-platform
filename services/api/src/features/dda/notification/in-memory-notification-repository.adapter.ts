import { Buffer } from 'node:buffer';

import {
  parseV3Contract,
  type DdaNotification,
  type DdaNotificationPage,
} from '@databreeze/contracts/v3';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  type NotificationIntentInputV1,
  type NotificationRecordV1,
  type NotificationRepositoryPortV1,
  type NotificationRepositoryResultV1,
  type NotificationStateV1,
  type NotificationTenantContextV1,
} from './notification-repository.port.js';

const NOTIFICATION_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v3/dda-notification' as const;
const PAGE_SCHEMA_ID = 'https://schemas.databreeze.dev/contracts/v3/dda-notification-page' as const;
const CURSOR_PATTERN = /^cursor-v1-[A-Za-z0-9_-]{1,480}$/u;
const FORBIDDEN_CONTENT_PATTERN =
  /(?:https?:\/\/|\\\\|\b(?:password|passwd|secret|credential|api[-_ ]?key|access[-_ ]?token|provider|openai|anthropic)\b|^[A-Za-z]:[\\/])/iu;

interface CursorValue {
  readonly createdAt: string;
  readonly id: string;
}

function rejected<TValue>(
  code: NotificationRepositoryCode,
): NotificationRepositoryResultV1<TValue> {
  return Object.freeze({ accepted: false as const, code });
}

type NotificationRepositoryCode = 'INVALID_CURSOR' | 'NOT_FOUND' | 'CONFLICT' | 'UNAVAILABLE';

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
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      typeof (parsed as Record<string, unknown>)['createdAt'] !== 'string' ||
      typeof (parsed as Record<string, unknown>)['id'] !== 'string' ||
      !parseStrictUtcTimestampV1((parsed as Record<string, unknown>)['createdAt']).accepted ||
      !parseStableIdentifierV1((parsed as Record<string, unknown>)['id']).accepted
    )
      return 'INVALID';
    const parsedRecord = parsed as Record<string, unknown>;
    const createdAt = parsedRecord['createdAt'];
    const id = parsedRecord['id'];
    if (typeof createdAt !== 'string' || typeof id !== 'string') return 'INVALID';
    const canonical = encodeCursor({ createdAt, id });
    return canonical === value ? { createdAt, id } : 'INVALID';
  } catch {
    return 'INVALID';
  }
}

function compareNewest(left: NotificationRecordV1, right: NotificationRecordV1): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

function isSafeText(value: string): boolean {
  return (
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 160 &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    }) &&
    !FORBIDDEN_CONTENT_PATTERN.test(value)
  );
}

function isSafeRecord(value: NotificationRecordV1): boolean {
  return (
    parseStableIdentifierV1(value.id).accepted &&
    parseStableIdentifierV1(value.recipientId).accepted &&
    parseStableIdentifierV1(value.organizationId).accepted &&
    parseStableIdentifierV1(value.workspaceId).accepted &&
    parseStableIdentifierV1(value.subjectId).accepted &&
    parseStableIdentifierV1(value.correlationId).accepted &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 1 &&
    parseStrictUtcTimestampV1(value.createdAt).accepted &&
    isSafeText(value.labelVi) &&
    isSafeText(value.labelEn)
  );
}

function publicRecord(record: NotificationRecordV1): DdaNotification | undefined {
  if (!isSafeRecord(record)) return undefined;
  const { recipientId: _recipientId, organizationId: _organizationId, ...publicValue } = record;
  void _recipientId;
  void _organizationId;
  const parsed = parseV3Contract<DdaNotification>(NOTIFICATION_SCHEMA_ID, publicValue);
  return parsed.accepted ? Object.freeze(parsed.value) : undefined;
}

function pageIsValid(page: DdaNotificationPage): boolean {
  return parseV3Contract<DdaNotificationPage>(PAGE_SCHEMA_ID, page).accepted;
}

/** Explicit test-only adapter. Production composition uses UnavailableNotificationRepositoryAdapter. */
export class InMemoryNotificationRepositoryAdapter implements NotificationRepositoryPortV1 {
  private readonly records = new Map<string, NotificationRecordV1>();

  public async createIntent(
    context: NotificationTenantContextV1,
    input: NotificationIntentInputV1,
  ): Promise<NotificationRepositoryResultV1<DdaNotification>> {
    await Promise.resolve();
    if (
      context.tenantScope.scopeType !== 'workspace' ||
      context.tenantScope.workspaceId !== input.workspaceId ||
      !parseStableIdentifierV1(input.eventId).accepted
    )
      return rejected('UNAVAILABLE');
    const existing = this.records.get(input.notificationId);
    if (existing !== undefined) {
      const replay = publicRecord(existing);
      return replay === undefined ? rejected('UNAVAILABLE') : accepted(replay);
    }
    const record: NotificationRecordV1 = Object.freeze({
      schemaVersion: 3,
      id: input.notificationId,
      recipientId: input.recipientId,
      organizationId: context.tenantScope.organizationId,
      workspaceId: input.workspaceId,
      subjectId: input.subjectId,
      kind: input.kind,
      labelVi: input.labelVi,
      labelEn: input.labelEn,
      action: input.action,
      createdAt: input.createdAt,
      correlationId: input.correlationId,
      state: 'UNREAD',
      revision: 1,
    });
    const publicValue = publicRecord(record);
    if (publicValue === undefined) return rejected('UNAVAILABLE');
    this.records.set(record.id, record);
    return accepted(publicValue);
  }

  public seed(records: readonly NotificationRecordV1[]): void {
    this.records.clear();
    for (const record of records) this.records.set(record.id, Object.freeze({ ...record }));
  }

  public async list(
    context: NotificationTenantContextV1,
    input: { readonly limit: number; readonly cursor?: string },
  ): Promise<NotificationRepositoryResultV1<DdaNotificationPage>> {
    await Promise.resolve();
    if (input.limit < 1 || input.limit > 50 || !Number.isSafeInteger(input.limit))
      return rejected('INVALID_CURSOR');
    const decoded = decodeCursor(input.cursor);
    if (decoded === 'INVALID') return rejected('INVALID_CURSOR');
    const tenantScope = context.tenantScope;
    if (tenantScope.scopeType !== 'workspace' || tenantScope.workspaceId === undefined)
      return rejected('UNAVAILABLE');
    const workspaceId = tenantScope.workspaceId;

    const filtered = [...this.records.values()]
      .filter(
        (record) =>
          record.recipientId === context.actorId &&
          record.organizationId === context.tenantScope.organizationId &&
          record.workspaceId === workspaceId,
      )
      .sort(compareNewest);
    if (filtered.some((record) => publicRecord(record) === undefined))
      return rejected('UNAVAILABLE');
    const unreadCount = filtered.filter((record) => record.state === 'UNREAD').length;
    const start =
      decoded === undefined
        ? 0
        : filtered.findIndex(
            (record) =>
              record.createdAt < decoded.createdAt ||
              (record.createdAt === decoded.createdAt && record.id < decoded.id),
          );
    const safeStart = decoded === undefined ? 0 : start < 0 ? filtered.length : start;
    const selected = filtered.slice(safeStart, safeStart + input.limit);
    const items: DdaNotification[] = [];
    for (const record of selected) {
      const value = publicRecord(record);
      if (value === undefined) return rejected('UNAVAILABLE');
      items.push(value);
    }
    const last = selected[selected.length - 1];
    const nextCursor =
      last !== undefined && safeStart + selected.length < filtered.length
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : undefined;
    const page: DdaNotificationPage = Object.freeze({
      schemaVersion: 3,
      items: Object.freeze(items),
      unreadCount,
      ...(nextCursor === undefined ? {} : { nextCursor }),
    });
    return pageIsValid(page) ? accepted(page) : rejected('UNAVAILABLE');
  }

  public async setState(
    context: NotificationTenantContextV1,
    input: {
      readonly notificationId: string;
      readonly state: Exclude<NotificationStateV1, 'UNREAD'>;
      readonly expectedRevision: number;
    },
  ): Promise<NotificationRepositoryResultV1<DdaNotification>> {
    await Promise.resolve();
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)
      return rejected('CONFLICT');
    if (
      context.tenantScope.scopeType !== 'workspace' ||
      context.tenantScope.workspaceId === undefined
    )
      return rejected('UNAVAILABLE');
    const current = this.records.get(input.notificationId);
    if (
      current === undefined ||
      current.recipientId !== context.actorId ||
      current.organizationId !== context.tenantScope.organizationId ||
      current.workspaceId !== context.tenantScope.workspaceId
    )
      return rejected('NOT_FOUND');
    if (
      current.state === input.state &&
      (current.revision === input.expectedRevision ||
        current.revision === input.expectedRevision + 1)
    ) {
      const replay = publicRecord(current);
      return replay === undefined ? rejected('UNAVAILABLE') : accepted(replay);
    }
    if (current.revision !== input.expectedRevision) return rejected('CONFLICT');
    const next = Object.freeze({ ...current, state: input.state, revision: current.revision + 1 });
    const publicValue = publicRecord(next);
    if (publicValue === undefined) return rejected('UNAVAILABLE');
    this.records.set(next.id, next);
    return accepted(publicValue);
  }
}
