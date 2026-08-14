import { createHash } from 'node:crypto';

import type { DdaNotification } from '@databreeze/contracts/v3';

import type {
  NotificationStateV1,
  NotificationTenantContextV1,
  NotificationRepositoryResultV1,
} from './notification-repository.port.js';

export const DDA_NOTIFICATION_STATE_COMMAND_PORT = Symbol('DDA_NOTIFICATION_STATE_COMMAND_PORT');

export interface NotificationStateCommandInputV1 {
  readonly context: NotificationTenantContextV1;
  readonly notificationId: string;
  readonly targetState: Exclude<NotificationStateV1, 'UNREAD'>;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
}

export type NotificationStateCommandResultV1 = NotificationRepositoryResultV1<DdaNotification>;

export interface NotificationStateCommandPortV1 {
  setStateCommand(
    input: NotificationStateCommandInputV1,
  ): Promise<NotificationStateCommandResultV1>;
}

/** Server-owned fingerprint for exact-scope command replay protection. */
export function fingerprintNotificationStateCommandV1(
  input: Pick<
    NotificationStateCommandInputV1,
    'context' | 'notificationId' | 'targetState' | 'expectedRevision' | 'idempotencyKey'
  >,
): string {
  const scope = input.context.tenantScope;
  return createHash('sha256')
    .update(
      JSON.stringify([
        scope.scopeType,
        scope.organizationId,
        scope.workspaceId ?? null,
        input.context.actorId,
        input.notificationId,
        input.targetState,
        input.expectedRevision,
        input.idempotencyKey,
      ]),
      'utf8',
    )
    .digest('hex');
}
