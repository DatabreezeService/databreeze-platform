import { createHash } from 'node:crypto';

import {
  DDA_NOTIFICATION_KINDS,
  projectNotification,
  type DdaNotificationKind,
} from './dda-notification-policy.js';
import type {
  NotificationAuthorizationProofV1,
  NotificationIntentInputV1,
  NotificationRepositoryPortV1,
  NotificationTenantContextV1,
} from './notification-repository.port.js';

const WINDOW_MS = 15 * 60 * 1000;
export const DDA_NOTIFICATION_PROJECTION_CONSUMER = Symbol('DDA_NOTIFICATION_PROJECTION_CONSUMER');
export const NOTIFICATION_PROJECTION_CONSUMER_KEY_V1 = 'dda-notification-projection-v1';
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface NotificationEventTenantScopeV1 {
  readonly scopeType: 'workspace';
  readonly organizationId: string;
  readonly workspaceId: string;
}

/** Safe committed-event envelope. It has no source payload, OCR, path, or evidence fields. */
export interface CommittedNotificationEventV1 {
  readonly committed: boolean;
  readonly tenantScope: NotificationEventTenantScopeV1;
  readonly eventId: string;
  readonly eventHash: string;
  readonly subjectId: string;
  readonly kind: DdaNotificationKind;
  readonly unresolved: boolean;
  readonly createdAt: string;
  readonly correlationId: string;
}

export interface AuthorizedNotificationRecipientV1 {
  readonly recipientId: string;
  readonly proof: NotificationAuthorizationProofV1;
}

export type NotificationRecipientResolutionResultV1 =
  | {
      readonly accepted: true;
      readonly recipients: readonly AuthorizedNotificationRecipientV1[];
    }
  | { readonly accepted: false; readonly code: 'UNAVAILABLE' };

/** IAM/resource-owned resolver. An empty success means no active authorized recipient. */
export interface NotificationRecipientResolverPortV1 {
  resolve(event: CommittedNotificationEventV1): Promise<NotificationRecipientResolutionResultV1>;
}

export type NotificationResourceAuthorizationResultV1 =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly code: 'DENIED' | 'UNAVAILABLE' };

/** Resource-owned authorization is evaluated after active membership resolution. */
export interface NotificationResourceAuthorizationPortV1 {
  authorize(input: {
    readonly event: CommittedNotificationEventV1;
    readonly recipientId: string;
  }): Promise<NotificationResourceAuthorizationResultV1>;
}

export class UnavailableNotificationResourceAuthorizationAdapter
  implements NotificationResourceAuthorizationPortV1
{
  public authorize(): Promise<NotificationResourceAuthorizationResultV1> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}

/** Default composition is deliberately unavailable until IAM/resource projection is wired. */
export class UnavailableNotificationRecipientResolverAdapter
  implements NotificationRecipientResolverPortV1
{
  public resolve(): Promise<NotificationRecipientResolutionResultV1> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}

export interface NotificationProjectionCheckpointV1 {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly consumerKey: string;
  readonly lastEventId: string;
  readonly lastEventHash: string;
  readonly lastOccurredAt: string;
}

export interface NotificationProjectionCheckpointPortV1 {
  getCheckpoint(input: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly consumerKey: string;
  }): Promise<NotificationProjectionCheckpointV1 | null>;
  advanceCheckpoint(
    input: NotificationProjectionCheckpointV1,
  ): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly code: 'CONFLICT' | 'UNAVAILABLE' }
  >;
}

export type NotificationProjectionConsumerResultV1 =
  | {
      readonly accepted: true;
      readonly deliveredCount: number;
      readonly replayed: boolean;
    }
  | {
      readonly accepted: false;
      readonly code:
        | 'NOT_COMMITTED'
        | 'INVALID_EVENT'
        | 'AUTHORIZATION_INVALID'
        | 'CONFLICT'
        | 'UNAVAILABLE';
    };

function isIdentifier(value: string): boolean {
  return ID_PATTERN.test(value);
}

function isTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(new Date(value).getTime())
  );
}

function isSafeToken(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 256 &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  );
}

function validEvent(event: CommittedNotificationEventV1): boolean {
  return (
    event.tenantScope.scopeType === 'workspace' &&
    isIdentifier(event.tenantScope.organizationId) &&
    isIdentifier(event.tenantScope.workspaceId) &&
    isIdentifier(event.eventId) &&
    HASH_PATTERN.test(event.eventHash) &&
    isIdentifier(event.subjectId) &&
    (DDA_NOTIFICATION_KINDS as readonly string[]).includes(event.kind) &&
    typeof event.unresolved === 'boolean' &&
    isTimestamp(event.createdAt) &&
    isIdentifier(event.correlationId)
  );
}

function validProof(
  event: CommittedNotificationEventV1,
  recipient: AuthorizedNotificationRecipientV1,
): boolean {
  const proof = recipient.proof;
  return (
    isIdentifier(recipient.recipientId) &&
    isIdentifier(proof.recipientId) &&
    recipient.recipientId === proof.recipientId &&
    proof.organizationId === event.tenantScope.organizationId &&
    proof.workspaceId === event.tenantScope.workspaceId &&
    proof.subjectId === event.subjectId &&
    proof.eventId === event.eventId &&
    Number.isSafeInteger(proof.authorizationEpoch) &&
    proof.authorizationEpoch > 0 &&
    isSafeToken(proof.token)
  );
}

function compareEvent(
  event: Pick<CommittedNotificationEventV1, 'eventId' | 'createdAt'>,
  checkpoint: Pick<NotificationProjectionCheckpointV1, 'lastEventId' | 'lastOccurredAt'>,
): number {
  return (
    event.createdAt.localeCompare(checkpoint.lastOccurredAt) ||
    event.eventId.localeCompare(checkpoint.lastEventId)
  );
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableUuid(seed: string): string {
  const hex = digest(seed).slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16] ?? '8', 16) % 4] ?? '8';
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function bundleWindowStart(createdAt: string): string {
  const timestamp = new Date(createdAt).getTime();
  return new Date(Math.floor(timestamp / WINDOW_MS) * WINDOW_MS).toISOString();
}

function bundleKey(
  event: CommittedNotificationEventV1,
  recipientId: string,
  windowStart: string,
): string {
  const securitySalt = event.kind === 'SECURITY_NOTICE' ? `|${event.eventId}` : '';
  return digest(
    `${event.tenantScope.organizationId}|${event.tenantScope.workspaceId}|${recipientId}|${event.subjectId}|${event.kind}|${event.unresolved ? 'open' : 'resolved'}|${windowStart}${securitySalt}`,
  );
}

function actionFor(route: string): NotificationIntentInputV1['action'] {
  if (route === '/dashboards') return 'OPEN_DASHBOARDS';
  if (route === '/analysis') return 'OPEN_ANALYSIS';
  if (route === '/inbox') return 'OPEN_INBOX';
  if (route === '/settings') return 'OPEN_SETTINGS';
  return 'OPEN_DATA';
}

function contextFor(
  event: CommittedNotificationEventV1,
  recipientId: string,
): NotificationTenantContextV1 {
  return {
    actorId: recipientId,
    tenantScope: event.tenantScope,
  };
}

export class NotificationProjectionConsumerV1 {
  public constructor(
    private readonly repository: NotificationRepositoryPortV1,
    private readonly recipientResolver: NotificationRecipientResolverPortV1,
    private readonly checkpoints: NotificationProjectionCheckpointPortV1,
    private readonly consumerKey = NOTIFICATION_PROJECTION_CONSUMER_KEY_V1,
  ) {}

  public async consume(
    event: CommittedNotificationEventV1,
  ): Promise<NotificationProjectionConsumerResultV1> {
    if (!event.committed) return { accepted: false, code: 'NOT_COMMITTED' };
    if (!validEvent(event)) return { accepted: false, code: 'INVALID_EVENT' };

    let checkpoint: NotificationProjectionCheckpointV1 | null;
    try {
      checkpoint = await this.checkpoints.getCheckpoint({
        organizationId: event.tenantScope.organizationId,
        workspaceId: event.tenantScope.workspaceId,
        consumerKey: this.consumerKey,
      });
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
    if (checkpoint !== null && compareEvent(event, checkpoint) <= 0) {
      return checkpoint.lastEventId === event.eventId &&
        checkpoint.lastEventHash !== event.eventHash
        ? { accepted: false, code: 'CONFLICT' }
        : { accepted: true, deliveredCount: 0, replayed: true };
    }

    let resolved: NotificationRecipientResolutionResultV1;
    try {
      resolved = await this.recipientResolver.resolve(event);
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
    if (!resolved.accepted) return { accepted: false, code: 'UNAVAILABLE' };
    for (const recipient of resolved.recipients) {
      if (!validProof(event, recipient)) return { accepted: false, code: 'AUTHORIZATION_INVALID' };
    }

    const projected = projectNotification({
      ...event,
      workspaceId: event.tenantScope.workspaceId,
    });
    const windowStart = bundleWindowStart(event.createdAt);
    let deliveredCount = 0;
    try {
      for (const recipient of resolved.recipients) {
        const intent: NotificationIntentInputV1 = {
          eventId: event.eventId,
          notificationId: stableUuid(
            `${event.tenantScope.organizationId}|${event.tenantScope.workspaceId}|${recipient.recipientId}|${bundleKey(event, recipient.recipientId, windowStart)}`,
          ),
          recipientId: recipient.recipientId,
          workspaceId: event.tenantScope.workspaceId,
          subjectId: event.subjectId,
          kind: event.kind,
          action: actionFor(projected.actionRoute),
          labelVi: projected.labelVi,
          labelEn: projected.labelEn,
          createdAt: event.createdAt,
          correlationId: event.correlationId,
          eventHash: event.eventHash,
          authorizationProof: recipient.proof,
          bundleKey: bundleKey(event, recipient.recipientId, windowStart),
          bundleWindowStart: windowStart,
        };
        const result = await this.repository.createIntent(
          contextFor(event, recipient.recipientId),
          intent,
        );
        if (result.accepted === false) {
          return {
            accepted: false,
            code: result.code === 'CONFLICT' ? 'CONFLICT' : 'UNAVAILABLE',
          };
        }
        deliveredCount += 1;
      }
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }

    const advanced = await this.checkpoints.advanceCheckpoint({
      organizationId: event.tenantScope.organizationId,
      workspaceId: event.tenantScope.workspaceId,
      consumerKey: this.consumerKey,
      lastEventId: event.eventId,
      lastEventHash: event.eventHash,
      lastOccurredAt: event.createdAt,
    });
    if (advanced.accepted === false) return { accepted: false, code: advanced.code };
    return { accepted: true, deliveredCount, replayed: false };
  }
}
