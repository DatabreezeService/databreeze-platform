import type {
  DdaNotificationKind,
  NotificationEventInput,
  ProjectedNotification,
} from './dda-notification-policy.js';
import {
  DDA_NOTIFICATION_KINDS,
  groupNotificationEvents,
  projectNotification,
  shouldSuppressRoutineRefresh,
} from './dda-notification-policy.js';

export interface CommittedNotificationEvent extends Omit<NotificationEventInput, 'kind'> {
  readonly committed: boolean;
  readonly kind: DdaNotificationKind | 'REFRESH_SUCCEEDED';
  readonly outcome?: 'SUCCEEDED' | 'FAILED' | 'BLOCKED';
}

function isProjectableEvent(
  event: CommittedNotificationEvent,
): event is CommittedNotificationEvent & NotificationEventInput & { readonly committed: true } {
  return (
    event.committed === true &&
    !shouldSuppressRoutineRefresh({ kind: event.kind, outcome: event.outcome ?? '' }) &&
    (DDA_NOTIFICATION_KINDS as readonly string[]).includes(event.kind)
  );
}

export function projectCommittedNotifications(
  events: readonly CommittedNotificationEvent[],
): readonly ProjectedNotification[] {
  const accepted = events.filter(isProjectableEvent);
  const grouped = groupNotificationEvents(accepted);
  return Object.freeze(
    grouped.map((group) => {
      const latest = accepted
        .filter((event) => group.eventIds.includes(event.eventId))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      if (latest === undefined) {
        throw new Error('NOTIFICATION_GROUP_EMPTY');
      }
      return Object.freeze({
        ...projectNotification(latest),
        occurrenceCount: group.occurrenceCount,
        firstOccurredAt: group.firstCreatedAt,
        lastOccurredAt: group.latestCreatedAt,
      });
    }),
  );
}

export type { DdaNotificationKind, ProjectedNotification };
