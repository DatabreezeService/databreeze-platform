import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import { Link } from 'react-router-dom';
import { appMessage } from '../../app/messages.ts';

export const DEFAULT_NOTIFICATION_LIMIT = 20;

export type NotificationReadState = 'UNREAD' | 'READ' | 'ARCHIVED' | 'DISMISSED';

export type NotificationCenterItem = {
  readonly eventId: string;
  readonly kind: string;
  readonly label: string;
  readonly unresolved: boolean;
  readonly state?: NotificationReadState;
  readonly read?: boolean;
  readonly unread?: boolean;
  readonly isRead?: boolean;
  readonly actionRoute?: string;
  readonly revision?: number;
};

export type NotificationCenterStatus = 'loading' | 'ready' | 'empty' | 'confirmed-empty' | 'error';

export type NotificationCenterState = {
  readonly status?: NotificationCenterStatus;
  readonly items?: readonly NotificationCenterItem[];
  readonly unreadCount?: number;
};

export type NotificationCenterProperties = {
  readonly locale: SupportedLocaleV1;
  readonly state?: NotificationCenterState;
  readonly items?: readonly NotificationCenterItem[];
  readonly status?: NotificationCenterStatus;
  readonly maxItems?: number;
  readonly onRetry?: () => void;
  readonly onStateChange?: (
    eventId: string,
    state: Exclude<NotificationReadState, 'UNREAD'>,
    expectedRevision: number,
  ) => void | Promise<void>;
};

export const DEFAULT_NOTIFICATION_STATE: NotificationCenterState = Object.freeze({
  status: 'empty',
  items: Object.freeze([]),
});

function resolveState(
  state: NotificationCenterState | undefined,
  items: readonly NotificationCenterItem[] | undefined,
  status: NotificationCenterStatus | undefined,
): {
  readonly status: NotificationCenterStatus;
  readonly items: readonly NotificationCenterItem[];
} {
  const resolvedItems = state?.items ?? items ?? [];
  const resolvedStatus = state?.status ?? status ?? (resolvedItems.length > 0 ? 'ready' : 'empty');
  return { status: resolvedStatus, items: resolvedItems };
}

function normalizeLimit(maxItems: number | undefined): number {
  if (maxItems === undefined || !Number.isFinite(maxItems)) return DEFAULT_NOTIFICATION_LIMIT;
  return Math.min(DEFAULT_NOTIFICATION_LIMIT, Math.max(0, Math.floor(maxItems)));
}

function readStateForItem(item: NotificationCenterItem): NotificationReadState | undefined {
  if (item.state !== undefined) return item.state;
  if (item.unread !== undefined) return item.unread ? 'UNREAD' : 'READ';
  if (item.read !== undefined) return item.read ? 'READ' : 'UNREAD';
  if (item.isRead !== undefined) return item.isRead ? 'READ' : 'UNREAD';
  return undefined;
}

export function isNotificationUnread(item: NotificationCenterItem): boolean {
  return readStateForItem(item) === 'UNREAD';
}

export function getUnreadNotificationCount(
  items: readonly NotificationCenterItem[],
  maxItems = DEFAULT_NOTIFICATION_LIMIT,
): number {
  return items.slice(0, normalizeLimit(maxItems)).filter(isNotificationUnread).length;
}

export function notificationTriggerLabel(locale: SupportedLocaleV1, unreadCount: number): string {
  if (unreadCount <= 0) return appMessage(locale, 'notifications.label');
  return appMessage(locale, 'notifications.unread').replace('{count}', String(unreadCount));
}

export function isSafeNotificationActionRoute(route: string | undefined): route is string {
  if (route === undefined || route.trim() !== route) return false;
  return /^\/(?:vi-VN|en)\/(?:dashboards|analysis|data|inbox|administration)$/u.test(route);
}

function itemLabel(locale: SupportedLocaleV1, item: NotificationCenterItem): string {
  return item.kind === 'SECURITY_NOTICE'
    ? appMessage(locale, 'notifications.security')
    : item.label;
}

const stateActionLabels: Readonly<
  Record<SupportedLocaleV1, Readonly<Record<'READ' | 'ARCHIVED' | 'DISMISSED', string>>>
> = Object.freeze({
  'vi-VN': {
    READ: 'Đánh dấu đã đọc',
    ARCHIVED: 'Lưu trữ',
    DISMISSED: 'Bỏ qua',
  },
  en: {
    READ: 'Mark as read',
    ARCHIVED: 'Archive',
    DISMISSED: 'Dismiss',
  },
});

function statusCopy(
  locale: SupportedLocaleV1,
  status: NotificationCenterStatus,
  hasItems: boolean,
): string {
  if (status === 'loading') return appMessage(locale, 'notifications.loading');
  if (status === 'error') return appMessage(locale, 'notifications.error');
  if (!hasItems || status === 'confirmed-empty') return appMessage(locale, 'notifications.empty');
  return '';
}

export function NotificationCenter({
  locale,
  state,
  items,
  status,
  maxItems,
  onRetry,
  onStateChange,
}: NotificationCenterProperties) {
  const resolvedState = resolveState(state, items, status);
  const itemLimit = normalizeLimit(maxItems);
  const visibleItems =
    resolvedState.status === 'ready' ? resolvedState.items.slice(0, itemLimit) : [];
  const unreadCount = state?.unreadCount ?? getUnreadNotificationCount(visibleItems, itemLimit);
  const title = appMessage(locale, 'notifications.heading');
  const copy = statusCopy(locale, resolvedState.status, visibleItems.length > 0);

  return (
    <section aria-label={title} className="notification-center">
      <header className="notification-center__header">
        <h2>{title}</h2>
        {unreadCount > 0 ? (
          <span
            aria-label={notificationTriggerLabel(locale, unreadCount)}
            className="notification-center__count"
          >
            {unreadCount}
          </span>
        ) : null}
      </header>
      <p
        aria-atomic="true"
        aria-live="polite"
        className="notification-center__status"
        role="status"
      >
        {copy}
        {resolvedState.status === 'error' && onRetry ? (
          <button type="button" onClick={onRetry}>
            {appMessage(locale, 'notifications.retry')}
          </button>
        ) : null}
      </p>
      {visibleItems.length > 0 ? (
        <ul aria-label={title}>
          {visibleItems.map((item) => {
            const readState = readStateForItem(item);
            const label = itemLabel(locale, item);
            const content = isSafeNotificationActionRoute(item.actionRoute) ? (
              <Link to={item.actionRoute}>{label}</Link>
            ) : (
              <span>{label}</span>
            );

            return (
              <li
                data-kind={item.kind}
                data-read-state={readState ?? 'UNKNOWN'}
                data-unresolved={String(item.unresolved)}
                key={item.eventId}
              >
                {content}
                {readState ? (
                  <span>
                    {readState === 'UNREAD'
                      ? appMessage(locale, 'notifications.unreadState')
                      : appMessage(locale, 'notifications.read')}
                  </span>
                ) : null}
                {onStateChange !== undefined &&
                readState !== undefined &&
                readState !== 'DISMISSED' &&
                Number.isSafeInteger(item.revision) &&
                (item.revision ?? 0) > 0 ? (
                  <div aria-label={appMessage(locale, 'notifications.label')}>
                    {readState === 'UNREAD' ? (
                      <button
                        type="button"
                        onClick={() =>
                          void onStateChange(item.eventId, 'READ', item.revision as number)
                        }
                      >
                        {stateActionLabels[locale].READ}
                      </button>
                    ) : null}
                    {readState !== 'ARCHIVED' ? (
                      <button
                        type="button"
                        onClick={() =>
                          void onStateChange(item.eventId, 'ARCHIVED', item.revision as number)
                        }
                      >
                        {stateActionLabels[locale].ARCHIVED}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        void onStateChange(item.eventId, 'DISMISSED', item.revision as number)
                      }
                    >
                      {stateActionLabels[locale].DISMISSED}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
