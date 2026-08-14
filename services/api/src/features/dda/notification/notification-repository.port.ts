import type { DdaNotification, DdaNotificationPage } from '@databreeze/contracts/v3';

export const DDA_NOTIFICATION_REPOSITORY_PORT = Symbol('DDA_NOTIFICATION_REPOSITORY_PORT');

/** Public foundation context shape. IAM owns construction; DDA consumes only this contract. */
export interface NotificationTenantContextV1 {
  readonly actorId: string;
  readonly tenantScope: {
    readonly scopeType: string;
    readonly organizationId: string;
    readonly workspaceId?: string;
  };
}

export type NotificationRepositoryCodeV1 =
  | 'INVALID_CURSOR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAVAILABLE';

export type NotificationRepositoryResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: NotificationRepositoryCodeV1 };

export type NotificationStateV1 = 'UNREAD' | 'READ' | 'ARCHIVED' | 'DISMISSED';
export type NotificationActionV1 =
  | 'OPEN_DASHBOARDS'
  | 'OPEN_ANALYSIS'
  | 'OPEN_DATA'
  | 'OPEN_INBOX'
  | 'OPEN_SETTINGS';

/** Capability issued only by the server-owned recipient resolver. */
export interface NotificationAuthorizationProofV1 {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly recipientId: string;
  readonly subjectId: string;
  readonly eventId: string;
  readonly authorizationEpoch: number;
  readonly token: string;
}

/** Internal committed record. Recipient and organization scope never cross the HTTP boundary. */
export interface NotificationRecordV1 extends Omit<DdaNotification, 'action' | 'kind' | 'state'> {
  readonly recipientId: string;
  readonly organizationId: string;
  readonly action: NotificationActionV1;
  readonly kind:
    | 'REVIEW_REQUIRED'
    | 'PREPARATION_BLOCKED'
    | 'SOURCE_MISMATCH'
    | 'SYNC_FAILED'
    | 'REFRESH_BLOCKED'
    | 'OCR_REVIEW_REQUIRED'
    | 'AGENT_BUDGET_DENIED'
    | 'SECURITY_NOTICE';
  readonly state: NotificationStateV1;
}

/** Server-owned, content-safe intent emitted from a committed domain event. */
export interface NotificationIntentInputV1 {
  readonly eventId: string;
  readonly notificationId: string;
  readonly recipientId: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly kind: NotificationRecordV1['kind'];
  readonly action: NotificationActionV1;
  readonly labelVi: string;
  readonly labelEn: string;
  readonly createdAt: string;
  readonly correlationId: string;
  readonly eventHash: string;
  /** Required at runtime by durable production persistence; omitted by legacy test doubles. */
  readonly authorizationProof?: NotificationAuthorizationProofV1;
  readonly bundleKey?: string;
  readonly bundleWindowStart?: string;
  readonly occurrenceCount?: number;
  readonly firstOccurredAt?: string;
  readonly lastOccurredAt?: string;
}

export interface NotificationRepositoryPortV1 {
  createIntent(
    context: NotificationTenantContextV1,
    input: NotificationIntentInputV1,
  ): Promise<NotificationRepositoryResultV1<DdaNotification>>;
  list(
    context: NotificationTenantContextV1,
    input: { readonly limit: number; readonly cursor?: string },
  ): Promise<NotificationRepositoryResultV1<DdaNotificationPage>>;
  setState(
    context: NotificationTenantContextV1,
    input: {
      readonly notificationId: string;
      readonly state: Exclude<NotificationStateV1, 'UNREAD'>;
      readonly expectedRevision: number;
      /** Client replay key from the generated state-command contract. */
      readonly idempotencyKey?: string;
    },
  ): Promise<NotificationRepositoryResultV1<DdaNotification>>;
}
