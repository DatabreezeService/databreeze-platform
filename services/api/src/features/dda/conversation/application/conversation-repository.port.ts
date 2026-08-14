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

export type ConversationRetentionStateV1 = 'ACTIVE' | 'PENDING_DELETE' | 'DELETED';

export interface ConversationRecordV1 {
  readonly conversationId: string;
  readonly tenantScope: TenantScopeV1;
  readonly title: string;
  readonly activeDatasetIds: readonly string[];
  readonly activeDatasetVersionIds: Readonly<Record<string, string>>;
  readonly dashboardId?: string;
  readonly filterContext?: string;
  /** Persisted retention state; legacy in-memory records may omit it. */
  readonly retentionState?: ConversationRetentionStateV1;
  readonly retentionHold: boolean;
  readonly revision: number;
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
  readonly datasetVersionId?: string;
  readonly createdAt: string;
}

export interface ConversationContextEventRecordV1 {
  readonly eventId: string;
  readonly conversationId: string;
  readonly tenantScope: TenantScopeV1;
  readonly kind: ConversationContextKindV1;
  /** Dataset identity is persisted for exact re-authorization of version transitions. */
  readonly datasetId?: string;
  readonly beforeVersionId?: string;
  readonly afterVersionId?: string;
  /** Assigned by the durable adapter; legacy in-memory callers may omit it. */
  readonly sequence?: number;
  readonly occurredAt: string;
}

export interface ConversationSummaryRecordV1 {
  readonly conversationId: string;
  readonly tenantScope: TenantScopeV1;
  readonly text: string;
  readonly revision: number;
  readonly updatedAt: string;
}

export type ConversationCreateResultV1 =
  | {
      readonly conversation: ConversationRecordV1;
      readonly replayed: boolean;
    }
  | 'IDEMPOTENCY_CONFLICT';

export type ConversationMessageAppendResultV1 =
  | ConversationMessageRecordV1
  | { readonly outcome: 'REPLAY'; readonly message: ConversationMessageRecordV1 }
  | 'IDEMPOTENT_REPLAY'
  | 'IDEMPOTENCY_CONFLICT';

export interface ConversationPageV1<TValue> {
  readonly items: readonly TValue[];
  readonly nextCursor?: string;
}

export interface ConversationContextAdvanceInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly conversationId: string;
  readonly datasetId: string;
  readonly beforeVersionId: string;
  readonly afterVersionId: string;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
}

export type ConversationContextAdvanceResultV1 =
  | {
      readonly outcome: 'ADVANCED' | 'REPLAY';
      readonly conversation: ConversationRecordV1;
      readonly event: ConversationContextEventRecordV1;
    }
  | 'IDEMPOTENCY_CONFLICT'
  | 'CONTEXT_CAS_CONFLICT';

export interface ConversationRepositoryPortV1 {
  create(record: ConversationRecordV1): Promise<ConversationRecordV1>;
  /** Optional during the in-memory migration; durable adapters must implement it. */
  readonly createWithIdempotency?: (
    record: ConversationRecordV1,
    idempotencyKey: string,
  ) => Promise<ConversationCreateResultV1>;
  findById(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<ConversationRecordV1 | undefined>;
  list(
    tenantScope: TenantScopeV1,
    cursor: string | undefined,
    limit: number,
  ): Promise<readonly ConversationRecordV1[]>;
  /** Durable adapters may expose page metadata while legacy adapters keep list compatibility. */
  readonly listPage?: (
    tenantScope: TenantScopeV1,
    cursor: string | undefined,
    limit: number,
  ) => Promise<ConversationPageV1<ConversationRecordV1>>;
  update(record: ConversationRecordV1): Promise<ConversationRecordV1>;
  appendMessage(record: ConversationMessageRecordV1): Promise<ConversationMessageAppendResultV1>;
  listMessages(
    tenantScope: TenantScopeV1,
    conversationId: string,
    beforeCursor: string | undefined,
    limit: number,
  ): Promise<readonly ConversationMessageRecordV1[]>;
  readonly listMessagesPage?: (
    tenantScope: TenantScopeV1,
    conversationId: string,
    beforeCursor: string | undefined,
    limit: number,
  ) => Promise<ConversationPageV1<ConversationMessageRecordV1>>;
  appendContextEvent(
    record: ConversationContextEventRecordV1,
  ): Promise<ConversationContextEventRecordV1>;
  listContextEvents(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<readonly ConversationContextEventRecordV1[]>;
  saveSummary(
    record: ConversationSummaryRecordV1,
  ): Promise<ConversationSummaryRecordV1 | 'REVISION_CONFLICT'>;
  findSummary(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<ConversationSummaryRecordV1 | undefined>;
  /** Atomic conversation CAS + event append with durable idempotency. */
  readonly advanceContext?: (
    input: ConversationContextAdvanceInputV1,
  ) => Promise<ConversationContextAdvanceResultV1>;
  readonly findContextEventByIdempotency?: (
    tenantScope: TenantScopeV1,
    conversationId: string,
    idempotencyKey: string,
  ) => Promise<ConversationContextEventRecordV1 | undefined>;
}
