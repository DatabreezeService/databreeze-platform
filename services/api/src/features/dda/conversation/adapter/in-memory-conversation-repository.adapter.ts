import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ConversationContextEventRecordV1,
  ConversationMessageRecordV1,
  ConversationRecordV1,
  ConversationRepositoryPortV1,
  ConversationSummaryRecordV1,
} from '../application/conversation-repository.port.js';

function scopeKey(scope: TenantScopeV1): string {
  if (scope.scopeType === 'organization') return `${scope.organizationId}:`;
  if (scope.scopeType === 'workspace') {
    return `${scope.organizationId}:${scope.workspaceId}`;
  }
  return `${scope.organizationId}:${scope.workspaceId}:${scope.projectId}`;
}

export class InMemoryConversationRepositoryAdapter implements ConversationRepositoryPortV1 {
  private readonly conversations = new Map<string, ConversationRecordV1>();
  private readonly messages = new Map<string, ConversationMessageRecordV1[]>();
  private readonly idempotency = new Map<string, ConversationMessageRecordV1>();
  private readonly events = new Map<string, ConversationContextEventRecordV1[]>();
  private readonly summaries = new Map<string, ConversationSummaryRecordV1>();

  public async create(record: ConversationRecordV1): Promise<ConversationRecordV1> {
    this.conversations.set(`${scopeKey(record.tenantScope)}:${record.conversationId}`, record);
    this.messages.set(record.conversationId, []);
    this.events.set(record.conversationId, []);
    return record;
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
    const capped = Math.min(Math.max(limit, 1), 50);
    const rows = [...this.conversations.values()]
      .filter((item) => scopeKey(item.tenantScope) === scopeKey(tenantScope))
      .sort((a, b) => {
        if (a.updatedAt === b.updatedAt) return b.conversationId.localeCompare(a.conversationId);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    const start = cursor ? rows.findIndex((item) => item.conversationId === cursor) + 1 : 0;
    return Object.freeze(rows.slice(Math.max(start, 0), Math.max(start, 0) + capped));
  }

  public async update(record: ConversationRecordV1): Promise<ConversationRecordV1> {
    this.conversations.set(`${scopeKey(record.tenantScope)}:${record.conversationId}`, record);
    return record;
  }

  public async appendMessage(
    record: ConversationMessageRecordV1,
  ): Promise<ConversationMessageRecordV1 | 'IDEMPOTENT_REPLAY'> {
    const idemKey = `${scopeKey(record.tenantScope)}:${record.idempotencyKey}`;
    const existing = this.idempotency.get(idemKey);
    if (existing) return 'IDEMPOTENT_REPLAY';
    const list = this.messages.get(record.conversationId) ?? [];
    const withSequence = Object.freeze({ ...record, sequence: list.length + 1 });
    list.push(withSequence);
    this.messages.set(record.conversationId, list);
    this.idempotency.set(idemKey, withSequence);
    return withSequence;
  }

  public async listMessages(
    tenantScope: TenantScopeV1,
    conversationId: string,
    beforeCursor: string | undefined,
    limit: number,
  ): Promise<readonly ConversationMessageRecordV1[]> {
    const capped = Math.min(Math.max(limit, 1), 50);
    const rows = (this.messages.get(conversationId) ?? []).filter(
      (item) => scopeKey(item.tenantScope) === scopeKey(tenantScope),
    );
    const end = beforeCursor
      ? rows.findIndex((item) => item.messageId === beforeCursor)
      : rows.length;
    const sliceEnd = end < 0 ? rows.length : end;
    return Object.freeze(rows.slice(Math.max(0, sliceEnd - capped), sliceEnd));
  }

  public async appendContextEvent(
    record: ConversationContextEventRecordV1,
  ): Promise<ConversationContextEventRecordV1> {
    const list = this.events.get(record.conversationId) ?? [];
    list.push(record);
    this.events.set(record.conversationId, list);
    return record;
  }

  public async listContextEvents(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<readonly ConversationContextEventRecordV1[]> {
    return Object.freeze(
      (this.events.get(conversationId) ?? []).filter(
        (item) => scopeKey(item.tenantScope) === scopeKey(tenantScope),
      ),
    );
  }

  public async saveSummary(
    record: ConversationSummaryRecordV1,
  ): Promise<ConversationSummaryRecordV1 | 'REVISION_CONFLICT'> {
    const key = `${scopeKey(record.tenantScope)}:${record.conversationId}`;
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
