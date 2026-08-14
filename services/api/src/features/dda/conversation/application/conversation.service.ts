import { randomUUID } from 'node:crypto';

import { tenantScopesEqualV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ConversationContextEventRecordV1,
  ConversationPageV1,
  ConversationRecordV1,
  ConversationRepositoryPortV1,
  ConversationMessageRecordV1,
} from './conversation-repository.port.js';

export type ConversationProblemCodeV1 =
  | 'DDA_CONVERSATION_NOT_FOUND'
  | 'DDA_CONVERSATION_UNAUTHORIZED'
  | 'DDA_CONVERSATION_RETENTION_HOLD'
  | 'DDA_CONVERSATION_INVALID_ATTACHMENT'
  | 'DDA_CONVERSATION_IDEMPOTENCY_CONFLICT'
  | 'DDA_CONVERSATION_MESSAGE_IDEMPOTENCY_CONFLICT'
  | 'DDA_CONVERSATION_INTEGRITY_UNAVAILABLE'
  | 'DDA_CONVERSATION_SUMMARY_TOO_LONG'
  | 'DDA_CONVERSATION_SUMMARY_CONFLICT';

export type ConversationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ConversationProblemCodeV1 };

function rejected(code: ConversationProblemCodeV1): ConversationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

/** DDA-055: workspace-owned immutable conversation operations. */
export class ConversationService {
  public constructor(private readonly repository: ConversationRepositoryPortV1) {}

  public async createConversation(
    context: { readonly tenantScope: TenantScopeV1; readonly memberAuthorized: boolean },
    input: {
      readonly title: string;
      readonly datasetIds: readonly string[];
      readonly datasetVersionIds: Readonly<Record<string, string>>;
      readonly dashboardId?: string;
      readonly filterContext?: string;
    },
    _idempotencyKey: string,
  ): Promise<ConversationResultV1<ConversationRecordV1>> {
    if (!context.memberAuthorized) return rejected('DDA_CONVERSATION_UNAUTHORIZED');
    if (input.datasetIds.length === 0) return rejected('DDA_CONVERSATION_INVALID_ATTACHMENT');
    for (const datasetId of input.datasetIds) {
      if (!input.datasetVersionIds[datasetId]) {
        return rejected('DDA_CONVERSATION_INVALID_ATTACHMENT');
      }
    }
    const now = new Date().toISOString();
    const record: ConversationRecordV1 = Object.freeze({
      conversationId: randomUUID(),
      tenantScope: context.tenantScope,
      title: input.title.slice(0, 200),
      activeDatasetIds: Object.freeze([...input.datasetIds]),
      activeDatasetVersionIds: Object.freeze({ ...input.datasetVersionIds }),
      ...(input.dashboardId === undefined ? {} : { dashboardId: input.dashboardId }),
      ...(input.filterContext === undefined ? {} : { filterContext: input.filterContext }),
      retentionHold: false,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
    const created = this.repository.createWithIdempotency
      ? await this.repository.createWithIdempotency(record, _idempotencyKey)
      : { conversation: await this.repository.create(record), replayed: false };
    if (created === 'IDEMPOTENCY_CONFLICT') {
      return rejected('DDA_CONVERSATION_IDEMPOTENCY_CONFLICT');
    }
    return Object.freeze({ accepted: true, value: created.conversation });
  }

  public async appendUserMessage(
    context: { readonly tenantScope: TenantScopeV1; readonly memberAuthorized: boolean },
    conversationId: string,
    input: {
      readonly messageId: string;
      readonly text: string;
      readonly idempotencyKey: string;
      readonly datasetVersionId?: string;
    },
  ): Promise<
    ConversationResultV1<{
      readonly queuedTurnId: string;
      readonly message: ConversationMessageRecordV1;
    }>
  > {
    if (!context.memberAuthorized) return rejected('DDA_CONVERSATION_UNAUTHORIZED');
    const conversation = await this.repository.findById(context.tenantScope, conversationId);
    if (!conversation || !tenantScopesEqualV1(conversation.tenantScope, context.tenantScope)) {
      return rejected('DDA_CONVERSATION_NOT_FOUND');
    }
    if (conversation.retentionHold) return rejected('DDA_CONVERSATION_RETENTION_HOLD');

    const message: ConversationMessageRecordV1 = Object.freeze({
      messageId: input.messageId,
      conversationId,
      tenantScope: context.tenantScope,
      role: 'USER' as const,
      text: input.text,
      sequence: 0,
      idempotencyKey: input.idempotencyKey,
      ...(input.datasetVersionId === undefined
        ? conversation.activeDatasetIds[0] === undefined
          ? {}
          : {
              datasetVersionId:
                conversation.activeDatasetVersionIds[conversation.activeDatasetIds[0]],
            }
        : { datasetVersionId: input.datasetVersionId }),
      createdAt: new Date().toISOString(),
    });
    const appended = await this.repository.appendMessage(message);
    if (appended === 'IDEMPOTENCY_CONFLICT') {
      return rejected('DDA_CONVERSATION_MESSAGE_IDEMPOTENCY_CONFLICT');
    }
    const saved =
      appended === 'IDEMPOTENT_REPLAY'
        ? message
        : typeof appended === 'object' && 'outcome' in appended
          ? appended.message
          : appended;
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        queuedTurnId: randomUUID(),
        message: saved,
      }),
    });
  }

  public async listConversations(
    context: { readonly tenantScope: TenantScopeV1; readonly memberAuthorized: boolean },
    cursor: string | undefined,
    limit: number,
  ): Promise<ConversationResultV1<ConversationPageV1<ConversationRecordV1>>> {
    if (!context.memberAuthorized) return rejected('DDA_CONVERSATION_UNAUTHORIZED');
    const page = this.repository.listPage
      ? await this.repository.listPage(context.tenantScope, cursor, limit)
      : { items: await this.repository.list(context.tenantScope, cursor, limit) };
    return Object.freeze({ accepted: true, value: page });
  }

  public async loadConversation(
    context: { readonly tenantScope: TenantScopeV1; readonly memberAuthorized: boolean },
    conversationId: string,
    beforeCursor: string | undefined,
    limit: number,
  ): Promise<
    ConversationResultV1<{
      readonly conversation: ConversationRecordV1;
      readonly messages: readonly ConversationMessageRecordV1[];
      readonly contextEvents: readonly ConversationContextEventRecordV1[];
      readonly nextMessagesCursor?: string;
    }>
  > {
    if (!context.memberAuthorized) return rejected('DDA_CONVERSATION_UNAUTHORIZED');
    const conversation = await this.repository.findById(context.tenantScope, conversationId);
    if (!conversation || !tenantScopesEqualV1(conversation.tenantScope, context.tenantScope)) {
      return rejected('DDA_CONVERSATION_NOT_FOUND');
    }
    const messagePage = this.repository.listMessagesPage
      ? await this.repository.listMessagesPage(
          context.tenantScope,
          conversationId,
          beforeCursor,
          limit,
        )
      : {
          items: await this.repository.listMessages(
            context.tenantScope,
            conversationId,
            beforeCursor,
            limit,
          ),
        };
    const contextEvents = await this.repository.listContextEvents(
      context.tenantScope,
      conversationId,
    );
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        conversation,
        messages: messagePage.items,
        contextEvents,
        ...(messagePage.nextCursor === undefined
          ? {}
          : { nextMessagesCursor: messagePage.nextCursor }),
      }),
    });
  }

  public async saveSummary(
    context: { readonly tenantScope: TenantScopeV1; readonly memberAuthorized: boolean },
    conversationId: string,
    input: { readonly text: string; readonly revision: number },
  ): Promise<ConversationResultV1<{ readonly revision: number }>> {
    if (!context.memberAuthorized) return rejected('DDA_CONVERSATION_UNAUTHORIZED');
    if (input.text.length > 8000) return rejected('DDA_CONVERSATION_SUMMARY_TOO_LONG');
    const conversation = await this.repository.findById(context.tenantScope, conversationId);
    if (!conversation) return rejected('DDA_CONVERSATION_NOT_FOUND');
    const saved = await this.repository.saveSummary({
      conversationId,
      tenantScope: context.tenantScope,
      text: input.text,
      revision: input.revision,
      updatedAt: new Date().toISOString(),
    });
    if (saved === 'REVISION_CONFLICT') return rejected('DDA_CONVERSATION_SUMMARY_CONFLICT');
    return Object.freeze({ accepted: true, value: Object.freeze({ revision: saved.revision }) });
  }
}
