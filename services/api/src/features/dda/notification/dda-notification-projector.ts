import type {
  DdaNotificationKind,
  NotificationEventInput,
  ProjectedNotification,
} from './dda-notification-policy.js';
import {
  groupNotificationEvents,
  projectNotification,
  shouldSuppressRoutineRefresh,
} from './dda-notification-policy.js';

export interface CommittedNotificationEvent extends NotificationEventInput {
  readonly committed: true;
}

export function projectCommittedNotifications(
  events: readonly CommittedNotificationEvent[],
): readonly ProjectedNotification[] {
  const accepted = events.filter((event) => {
    if (!event.committed) return false;
    if (shouldSuppressRoutineRefresh({ kind: event.kind, outcome: 'SUCCEEDED' })) return false;
    return true;
  });
  const grouped = groupNotificationEvents(accepted);
  return Object.freeze(
    grouped.map((group) => {
      const latest = accepted
        .filter((event) => group.eventIds.includes(event.eventId))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      if (latest === undefined) {
        throw new Error('NOTIFICATION_GROUP_EMPTY');
      }
      return projectNotification(latest);
    }),
  );
}

export type { DdaNotificationKind, ProjectedNotification };
