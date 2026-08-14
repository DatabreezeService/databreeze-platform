/* eslint-disable @typescript-eslint/require-await -- in-memory adapter mirrors the durable async repository port. */

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  ConversationContextAdvanceInputV1,
  ConversationContextAdvanceResultV1,
  ConversationContextEventRecordV1,
  ConversationCreateResultV1,
  ConversationMessageRecordV1,
  ConversationMessageAppendResultV1,
  ConversationPageV1,
  ConversationRecordV1,
  ConversationRepositoryPortV1,
  ConversationSummaryRecordV1,
} from '../application/conversation-repository.port.js';

function scopeKey(scope: TenantScopeV1): string {
  if (scope.scopeType === 'organization') throw new Error('DDA_CONVERSATION_SCOPE_REQUIRED');
  if (scope.scopeType === 'workspace') {
    return `${scope.organizationId}:${scope.workspaceId}`;
  }
  return `${scope.organizationId}:${scope.workspaceId}:${scope.projectId}`;
}

type Cursor =
  | {
      readonly kind: 'conversation';
      readonly scopeKey: string;
      readonly updatedAt: string;
      readonly id: string;
    }
  | {
      readonly kind: 'message';
      readonly scopeKey: string;
      readonly conversationId: string;
      readonly sequence: number;
      readonly id: string;
    };

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function invalidCursor(): never {
  throw new Error('DDA_CONVERSATION_CURSOR_INVALID');
}

function decodeCursor(
  cursor: string | undefined,
  kind: 'conversation',
): Extract<Cursor, { readonly kind: 'conversation' }> | undefined;
function decodeCursor(
  cursor: string | undefined,
  kind: 'message',
): Extract<Cursor, { readonly kind: 'message' }> | undefined;
function decodeCursor(cursor: string | undefined, kind: Cursor['kind']): Cursor | undefined {
  if (cursor === undefined) return undefined;
  if (cursor.length < 16 || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(cursor)) {
    return invalidCursor();
  }
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalidCursor();
    const record = value as Record<string, unknown>;
    const expectedKeys =
      kind === 'conversation'
        ? ['id', 'kind', 'scopeKey', 'updatedAt']
        : ['conversationId', 'id', 'kind', 'scopeKey', 'sequence'];
    if (
      record['kind'] !== kind ||
      typeof record['scopeKey'] !== 'string' ||
      typeof record['id'] !== 'string' ||
      !parseStableIdentifierV1(record['id']).accepted ||
      Object.keys(record).sort().join('|') !== expectedKeys.join('|')
    ) {
      return invalidCursor();
    }
    if (kind === 'conversation') {
      if (
        typeof record['updatedAt'] !== 'string' ||
        !parseStrictUtcTimestampV1(record['updatedAt']).accepted
      ) {
        return invalidCursor();
      }
    } else if (
      typeof record['conversationId'] !== 'string' ||
      !parseStableIdentifierV1(record['conversationId']).accepted ||
      !Number.isSafeInteger(record['sequence']) ||
      (record['sequence'] as number) < 1
    ) {
      return invalidCursor();
    }
    if (encodeCursor(record as unknown as Cursor) !== cursor) return invalidCursor();
    return record as unknown as Cursor;
  } catch {
    return invalidCursor();
  }
}

function conversationFingerprint(record: ConversationRecordV1): string {
  return JSON.stringify({
    tenantScope: record.tenantScope,
    title: record.title,
    activeDatasetIds: [...record.activeDatasetIds].sort(),
    activeDatasetVersionIds: Object.fromEntries(
      Object.entries(record.activeDatasetVersionIds).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    dashboardId: record.dashboardId ?? null,
    filterContext: record.filterContext ?? null,
    retentionHold: record.retentionHold,
  });
}

function contextAdvanceFingerprint(input: ConversationContextAdvanceInputV1): string {
  return JSON.stringify({
    tenantScope: input.tenantScope,
    conversationId: input.conversationId,
    datasetId: input.datasetId,
    beforeVersionId: input.beforeVersionId,
    afterVersionId: input.afterVersionId,
  });
}

export class InMemoryConversationRepositoryAdapter implements ConversationRepositoryPortV1 {
  private readonly conversations = new Map<string, ConversationRecordV1>();
  private readonly createIdempotency = new Map<
    string,
    { readonly fingerprint: string; readonly conversationId: string }
  >();
  private readonly messages = new Map<string, ConversationMessageRecordV1[]>();
  private readonly idempotency = new Map<string, ConversationMessageRecordV1>();
  private readonly events = new Map<string, ConversationContextEventRecordV1[]>();
  private readonly contextIdempotency = new Map<
    string,
    { readonly event: ConversationContextEventRecordV1; readonly fingerprint: string }
  >();
  private readonly summaries = new Map<string, ConversationSummaryRecordV1>();

  public async create(record: ConversationRecordV1): Promise<ConversationRecordV1> {
    const key = `${scopeKey(record.tenantScope)}:${record.conversationId}`;
    if (this.conversations.has(key)) throw new Error('DDA_CONVERSATION_ID_CONFLICT');
    this.conversations.set(key, record);
    this.messages.set(record.conversationId, []);
    this.events.set(record.conversationId, []);
    return record;
  }

  public async createWithIdempotency(
    record: ConversationRecordV1,
    idempotencyKey: string,
  ): Promise<ConversationCreateResultV1> {
    const key = `${scopeKey(record.tenantScope)}:${idempotencyKey}`;
    const fingerprint = conversationFingerprint(record);
    const existing = this.createIdempotency.get(key);
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) return 'IDEMPOTENCY_CONFLICT';
      const conversation = this.conversations.get(
        `${scopeKey(record.tenantScope)}:${existing.conversationId}`,
      );
      if (conversation === undefined) throw new Error('DDA_CONVERSATION_INTEGRITY_UNAVAILABLE');
      return Object.freeze({ conversation, replayed: true });
    }
    const conversation = await this.create(record);
    this.createIdempotency.set(key, { fingerprint, conversationId: record.conversationId });
    return Object.freeze({ conversation, replayed: false });
  }

  public async findById(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<ConversationRecordV1 | undefined> {
    const found = this.conversations.get(`${scopeKey(tenantScope)}:${conversationId}`);
    return found;
  }

  public async list(
    tenantScope: TenantScopeV1,
    cursor: string | undefined,
    limit: number,
  ): Promise<readonly ConversationRecordV1[]> {
    return (await this.listPage(tenantScope, cursor, limit)).items;
  }

  public async listPage(
    tenantScope: TenantScopeV1,
    cursor: string | undefined,
    limit: number,
  ): Promise<ConversationPageV1<ConversationRecordV1>> {
    const capped = Math.min(Math.max(limit, 1), 50);
    const rows = [...this.conversations.values()]
      .filter((item) => scopeKey(item.tenantScope) === scopeKey(tenantScope))
      .sort((a, b) => {
        if (a.updatedAt === b.updatedAt) return b.conversationId.localeCompare(a.conversationId);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    const decoded = decodeCursor(cursor, 'conversation');
    if (decoded !== undefined && decoded.scopeKey !== scopeKey(tenantScope)) {
      throw new Error('DDA_CONVERSATION_CURSOR_INVALID');
    }
    if (
      decoded !== undefined &&
      !rows.some(
        (item) => item.conversationId === decoded.id && item.updatedAt === decoded.updatedAt,
      )
    ) {
      throw new Error('DDA_CONVERSATION_CURSOR_INVALID');
    }
    const filtered =
      decoded === undefined
        ? rows
        : rows.filter(
            (item) =>
              item.updatedAt < decoded.updatedAt ||
              (item.updatedAt === decoded.updatedAt && item.conversationId < decoded.id),
          );
    const pageRows = filtered.slice(0, capped + 1);
    const items = pageRows.slice(0, capped);
    const nextCursor =
      pageRows.length > capped && items.at(-1) !== undefined
        ? encodeCursor({
            kind: 'conversation',
            scopeKey: scopeKey(tenantScope),
            updatedAt: items.at(-1)?.updatedAt as string,
            id: items.at(-1)?.conversationId as string,
          })
        : undefined;
    return Object.freeze({
      items: Object.freeze(items),
      ...(nextCursor === undefined ? {} : { nextCursor }),
    });
  }

  public async update(record: ConversationRecordV1): Promise<ConversationRecordV1> {
    const key = `${scopeKey(record.tenantScope)}:${record.conversationId}`;
    const existing = this.conversations.get(key);
    if (existing === undefined) throw new Error('DDA_CONVERSATION_NOT_FOUND');
    const updated = Object.freeze({
      ...record,
      retentionHold: existing.retentionHold || record.retentionHold,
    });
    this.conversations.set(key, updated);
    return updated;
  }

  public async appendMessage(
    record: ConversationMessageRecordV1,
  ): Promise<ConversationMessageAppendResultV1> {
    const idemKey = `${scopeKey(record.tenantScope)}:${record.conversationId}:${record.idempotencyKey}`;
    const conversation = this.conversations.get(
      `${scopeKey(record.tenantScope)}:${record.conversationId}`,
    );
    if (conversation === undefined) throw new Error('DDA_CONVERSATION_NOT_FOUND');
    if (conversation.retentionHold) throw new Error('DDA_CONVERSATION_RETENTION_HOLD');
    const existing = this.idempotency.get(idemKey);
    if (existing) {
      if (
        existing.messageId !== record.messageId ||
        existing.role !== record.role ||
        existing.text !== record.text ||
        (existing.datasetVersionId ?? undefined) !== (record.datasetVersionId ?? undefined)
      ) {
        return 'IDEMPOTENCY_CONFLICT';
      }
      return Object.freeze({ outcome: 'REPLAY' as const, message: existing });
    }
    const list = this.messages.get(record.conversationId) ?? [];
    const sequence =
      Math.max(
        0,
        ...list.map((item) => item.sequence),
        ...(this.events.get(record.conversationId) ?? []).map((item) => item.sequence ?? 0),
      ) + 1;
    const withSequence = Object.freeze({ ...record, sequence });
    list.push(withSequence);
    this.messages.set(record.conversationId, list);
    this.idempotency.set(idemKey, withSequence);
    this.conversations.set(
      `${scopeKey(record.tenantScope)}:${record.conversationId}`,
      Object.freeze({ ...conversation, updatedAt: record.createdAt }),
    );
    return withSequence;
  }

  public async listMessages(
    tenantScope: TenantScopeV1,
    conversationId: string,
    beforeCursor: string | undefined,
    limit: number,
  ): Promise<readonly ConversationMessageRecordV1[]> {
    return (await this.listMessagesPage(tenantScope, conversationId, beforeCursor, limit)).items;
  }

  public async listMessagesPage(
    tenantScope: TenantScopeV1,
    conversationId: string,
    beforeCursor: string | undefined,
    limit: number,
  ): Promise<ConversationPageV1<ConversationMessageRecordV1>> {
    const capped = Math.min(Math.max(limit, 1), 50);
    const rows = (this.messages.get(conversationId) ?? [])
      .filter((item) => scopeKey(item.tenantScope) === scopeKey(tenantScope))
      .sort((left, right) =>
        left.sequence === right.sequence
          ? left.messageId.localeCompare(right.messageId)
          : left.sequence - right.sequence,
      );
    const decoded = decodeCursor(beforeCursor, 'message');
    if (
      decoded !== undefined &&
      (decoded.scopeKey !== scopeKey(tenantScope) || decoded.conversationId !== conversationId)
    ) {
      throw new Error('DDA_CONVERSATION_CURSOR_INVALID');
    }
    if (
      decoded !== undefined &&
      !rows.some((item) => item.messageId === decoded.id && item.sequence === decoded.sequence)
    ) {
      throw new Error('DDA_CONVERSATION_CURSOR_INVALID');
    }
    const filtered =
      decoded === undefined
        ? rows
        : rows.filter(
            (item) =>
              item.sequence < decoded.sequence ||
              (item.sequence === decoded.sequence && item.messageId < decoded.id),
          );
    const pageRows = filtered.slice(Math.max(filtered.length - (capped + 1), 0));
    const items = pageRows.slice(-capped);
    const nextCursor =
      pageRows.length > capped && items[0] !== undefined
        ? encodeCursor({
            kind: 'message',
            scopeKey: scopeKey(tenantScope),
            conversationId,
            sequence: items[0].sequence,
            id: items[0].messageId,
          })
        : undefined;
    return Object.freeze({
      items: Object.freeze(items),
      ...(nextCursor === undefined ? {} : { nextCursor }),
    });
  }

  public async appendContextEvent(
    record: ConversationContextEventRecordV1,
  ): Promise<ConversationContextEventRecordV1> {
    const conversation = this.conversations.get(
      `${scopeKey(record.tenantScope)}:${record.conversationId}`,
    );
    if (conversation === undefined) throw new Error('DDA_CONVERSATION_NOT_FOUND');
    const list = this.events.get(record.conversationId) ?? [];
    const sequence =
      Math.max(
        0,
        ...(this.messages.get(record.conversationId) ?? []).map((item) => item.sequence),
        ...list.map((item) => item.sequence ?? 0),
      ) + 1;
    const saved = Object.freeze({ ...record, sequence });
    list.push(saved);
    this.events.set(record.conversationId, list);
    this.conversations.set(
      `${scopeKey(record.tenantScope)}:${record.conversationId}`,
      Object.freeze({ ...conversation, updatedAt: record.occurredAt }),
    );
    return saved;
  }

  public async findContextEventByIdempotency(
    tenantScope: TenantScopeV1,
    conversationId: string,
    idempotencyKey: string,
  ): Promise<ConversationContextEventRecordV1 | undefined> {
    return this.contextIdempotency.get(
      `${scopeKey(tenantScope)}:${conversationId}:${idempotencyKey}`,
    )?.event;
  }

  public async advanceContext(
    input: ConversationContextAdvanceInputV1,
  ): Promise<ConversationContextAdvanceResultV1> {
    const key = `${scopeKey(input.tenantScope)}:${input.conversationId}:${input.idempotencyKey}`;
    const fingerprint = contextAdvanceFingerprint(input);
    const existing = this.contextIdempotency.get(key);
    const conversationKey = `${scopeKey(input.tenantScope)}:${input.conversationId}`;
    const conversation = this.conversations.get(conversationKey);
    if (conversation === undefined) throw new Error('DDA_CONVERSATION_NOT_FOUND');
    if (existing !== undefined) {
      return existing.fingerprint === fingerprint
        ? { outcome: 'REPLAY', conversation, event: existing.event }
        : 'IDEMPOTENCY_CONFLICT';
    }
    if (
      conversation.activeDatasetVersionIds[input.datasetId] !== input.beforeVersionId ||
      input.beforeVersionId === input.afterVersionId
    ) {
      return 'CONTEXT_CAS_CONFLICT';
    }
    const event: ConversationContextEventRecordV1 = Object.freeze({
      eventId: input.eventId,
      conversationId: input.conversationId,
      tenantScope: input.tenantScope,
      kind: 'DATASET_VERSION_ADVANCED',
      datasetId: input.datasetId,
      beforeVersionId: input.beforeVersionId,
      afterVersionId: input.afterVersionId,
      sequence:
        Math.max(
          ...(this.messages.get(input.conversationId) ?? []).map((item) => item.sequence),
          ...(this.events.get(input.conversationId) ?? []).map((item) => item.sequence ?? 0),
          0,
        ) + 1,
      occurredAt: input.occurredAt,
    });
    const updatedConversation: ConversationRecordV1 = Object.freeze({
      ...conversation,
      activeDatasetVersionIds: Object.freeze({
        ...conversation.activeDatasetVersionIds,
        [input.datasetId]: input.afterVersionId,
      }),
      revision: conversation.revision + 1,
      updatedAt: input.occurredAt,
    });
    this.conversations.set(conversationKey, updatedConversation);
    const events = this.events.get(input.conversationId) ?? [];
    events.push(event);
    this.events.set(input.conversationId, events);
    this.contextIdempotency.set(key, { event, fingerprint });
    return { outcome: 'ADVANCED', conversation: updatedConversation, event };
  }

  public async listContextEvents(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<readonly ConversationContextEventRecordV1[]> {
    return Object.freeze(
      (this.events.get(conversationId) ?? [])
        .filter((item) => scopeKey(item.tenantScope) === scopeKey(tenantScope))
        .sort((left, right) =>
          left.sequence === right.sequence
            ? left.eventId.localeCompare(right.eventId)
            : (left.sequence ?? 0) - (right.sequence ?? 0),
        ),
    );
  }

  public async saveSummary(
    record: ConversationSummaryRecordV1,
  ): Promise<ConversationSummaryRecordV1 | 'REVISION_CONFLICT'> {
    const key = `${scopeKey(record.tenantScope)}:${record.conversationId}`;
    if (!this.conversations.has(key)) throw new Error('DDA_CONVERSATION_NOT_FOUND');
    const existing = this.summaries.get(key);
    if (existing && existing.revision !== record.revision - 1 && record.revision !== 1) {
      return 'REVISION_CONFLICT';
    }
    if (existing && record.revision !== existing.revision + 1) {
      return 'REVISION_CONFLICT';
    }
    this.summaries.set(key, record);
    return record;
  }

  public async findSummary(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<ConversationSummaryRecordV1 | undefined> {
    return this.summaries.get(`${scopeKey(tenantScope)}:${conversationId}`);
  }
}
