import type { DdaNotification, DdaNotificationPage } from '@databreeze/contracts/v3';

import {
  type NotificationIntentInputV1,
  type NotificationRepositoryPortV1,
  type NotificationRepositoryResultV1,
  type NotificationStateV1,
  type NotificationTenantContextV1,
} from './notification-repository.port.js';
import type {
  NotificationStateCommandInputV1,
  NotificationStateCommandPortV1,
} from './notification-state-command.port.js';

/** Fail-closed adapter used when the durable notification database is unavailable. */
export class UnavailableNotificationRepositoryAdapter implements NotificationRepositoryPortV1 {
  public createIntent(
    context: NotificationTenantContextV1,
    input: NotificationIntentInputV1,
  ): Promise<NotificationRepositoryResultV1<DdaNotification>> {
    void context;
    void input;
    return Promise.resolve(
      Object.freeze({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    );
  }

  public list(
    context: NotificationTenantContextV1,
    input: { readonly limit: number; readonly cursor?: string },
  ): Promise<NotificationRepositoryResultV1<DdaNotificationPage>> {
    void context;
    void input;
    return Promise.resolve(
      Object.freeze({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    );
  }

  public setState(
    context: NotificationTenantContextV1,
    input: {
      readonly notificationId: string;
      readonly state: Exclude<NotificationStateV1, 'UNREAD'>;
      readonly expectedRevision: number;
    },
  ): Promise<NotificationRepositoryResultV1<DdaNotification>> {
    void context;
    void input;
    return Promise.resolve(
      Object.freeze({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    );
  }
}

export class UnavailableNotificationStateCommandAdapter implements NotificationStateCommandPortV1 {
  public setStateCommand(
    input: NotificationStateCommandInputV1,
  ): Promise<NotificationRepositoryResultV1<DdaNotification>> {
    void input;
    return Promise.resolve(
      Object.freeze({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    );
  }
}
