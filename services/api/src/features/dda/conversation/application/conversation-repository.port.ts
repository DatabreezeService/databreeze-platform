import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export const CONVERSATION_REPOSITORY_PORT = Symbol('CONVERSATION_REPOSITORY_PORT');

export type ConversationMessageRoleV1 = 'USER' | 'AGENT' | 'SYSTEM';

export type ConversationContextKindV1 =
  | 'CONTEXT_RESTORED'
  | 'DATASET_VERSION_ADVANCED'
  | 'DATASET_ATTACHED'
  | 'DATASET_DETACHED'
  | 'DASHBOARD_VERSION_ADVANCED'
  | 'FILTER_CONTEXT_CHANGED';

export interface ConversationRecordV1 {
  readonly conversationId: string;
  readonly tenantScope: TenantScopeV1;
  readonly title: string;
  readonly activeDatasetIds: readonly string[];
  readonly activeDatasetVersionIds: Readonly<Record<string, string>>;
  readonly dashboardId?: string;
  readonly filterContext?: string;
  readonly retentionHold: boolean;
  readonly updatedAt: string;
  readonly createdAt: string;
}

export interface ConversationMessageRecordV1 {
  readonly messageId: string;
  readonly conversationId: string;
  readonly tenantScope: TenantScopeV1;
  readonly role: ConversationMessageRoleV1;
  readonly text: string;
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}

export interface ConversationContextEventRecordV1 {
  readonly eventId: string;
  readonly conversationId: string;
  readonly tenantScope: TenantScopeV1;
  readonly kind: ConversationContextKindV1;
  readonly beforeVersionId?: string;
  readonly afterVersionId?: string;
  readonly occurredAt: string;
}

export interface ConversationSummaryRecordV1 {
  readonly conversationId: string;
  readonly tenantScope: TenantScopeV1;
  readonly text: string;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface ConversationRepositoryPortV1 {
  create(record: ConversationRecordV1): Promise<ConversationRecordV1>;
  findById(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<ConversationRecordV1 | undefined>;
  list(
    tenantScope: TenantScopeV1,
    cursor: string | undefined,
    limit: number,
  ): Promise<readonly ConversationRecordV1[]>;
  update(record: ConversationRecordV1): Promise<ConversationRecordV1>;
  appendMessage(
    record: ConversationMessageRecordV1,
  ): Promise<ConversationMessageRecordV1 | 'IDEMPOTENT_REPLAY'>;
  listMessages(
    tenantScope: TenantScopeV1,
    conversationId: string,
    beforeCursor: string | undefined,
    limit: number,
  ): Promise<readonly ConversationMessageRecordV1[]>;
  appendContextEvent(
    record: ConversationContextEventRecordV1,
  ): Promise<ConversationContextEventRecordV1>;
  listContextEvents(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<readonly ConversationContextEventRecordV1[]>;
  saveSummary(record: ConversationSummaryRecordV1): Promise<ConversationSummaryRecordV1 | 'REVISION_CONFLICT'>;
  findSummary(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<ConversationSummaryRecordV1 | undefined>;
}
