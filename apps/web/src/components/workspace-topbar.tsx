import { formatMessageV1, type SupportedLocaleV1 } from '@databreeze/i18n/v1';
import type { IamBootstrapValue } from '@databreeze/contracts/v4';
import { Button } from '@databreeze/ui/v1';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { appMessage } from '../app/messages.ts';
import {
  DEFAULT_NOTIFICATION_STATE,
  getUnreadNotificationCount,
  notificationTriggerLabel,
  NotificationCenter,
  type NotificationCenterState,
} from '../features/notifications/notification-center.tsx';
import { useNotificationStoreResource } from '../features/notifications/notification-store.ts';
import { WorkspaceSwitcher } from '../features/workspace/workspace-switcher.tsx';
import { BellIcon, MenuIcon, XIcon } from './icons.tsx';
import { WorkspaceLocaleMenu } from './workspace-locale-menu.tsx';

export interface WorkspaceTopbarProperties {
  readonly bootstrap?: IamBootstrapValue;
  readonly dashboardMode?: boolean;
  readonly isMobile: boolean;
  readonly locale: SupportedLocaleV1;
  readonly mobileNavigationOpen: boolean;
  readonly onMobileNavigationOpenChange: (open: boolean) => void;
  readonly notificationState?: NotificationCenterState;
  /** Alias for callers that already expose a notifications store slice. */
  readonly notifications?: NotificationCenterState;
  readonly notificationMaxItems?: number;
  readonly onNotificationRetry?: () => void;
  readonly onSignOut?: () => void | Promise<void>;
}

/** WEB-013/014: workspace context and utility controls without the legacy global search strip. */
export function WorkspaceTopbar({
  bootstrap,
  dashboardMode = false,
  isMobile,
  locale,
  mobileNavigationOpen,
  onMobileNavigationOpenChange,
  notificationState,
  notifications,
  notificationMaxItems,
  onNotificationRetry,
  onSignOut,
}: WorkspaceTopbarProperties) {
  const location = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationTriggerRef = useRef<HTMLButtonElement>(null);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const wasNotificationsOpenRef = useRef(false);
  const alternateLocale = locale === 'en' ? 'vi-VN' : 'en';
  const localDemoMode = import.meta.env['VITE_DATABREEZE_DEMO_MODE'] === 'true';
  const logicalPath = location.pathname.split('/').filter(Boolean).slice(1).join('/');
  const alternatePath = `/${alternateLocale}/${logicalPath}${location.search}${location.hash}`;
  const scope = bootstrap?.session;
  const organization = bootstrap?.organizations.find((entry) => entry.id === scope?.organizationId);
  const workspace =
    scope?.scopeType === 'organization'
      ? undefined
      : organization?.workspaces.find((entry) => entry.id === scope?.workspaceId);
  const project =
    scope?.scopeType === 'project'
      ? workspace?.projects.find((entry) => entry.id === scope.projectId)
      : undefined;
  const workspaceOptions =
    organization?.workspaces
      .filter((entry) => entry.status === 'ACTIVE')
      .map((entry) => ({ id: entry.id, name: entry.name })) ?? [];
  const dashboardWorkspaceLabel = workspace?.name ?? organization?.name ?? 'Bright Cloud';
  const notificationControlled = notificationState !== undefined || notifications !== undefined;
  const notificationResource = useNotificationStoreResource(
    locale,
    notificationState === undefined && notifications === undefined,
  );
  const liveNotificationState = notificationResource.state;
  const activeNotificationState =
    notificationState ?? notifications ?? liveNotificationState ?? DEFAULT_NOTIFICATION_STATE;
  const notificationStatus =
    activeNotificationState.status ??
    (activeNotificationState.items && activeNotificationState.items.length > 0 ? 'ready' : 'empty');
  const notificationItems =
    notificationStatus === 'ready' ? (activeNotificationState.items ?? []) : [];
  const unreadCount =
    activeNotificationState.unreadCount ??
    getUnreadNotificationCount(notificationItems, notificationMaxItems);
  const notificationLabel = notificationTriggerLabel(locale, unreadCount);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);
  const notificationCenterOptionalProperties = {
    ...(notificationMaxItems === undefined ? {} : { maxItems: notificationMaxItems }),
    ...(onNotificationRetry === undefined ? {} : { onRetry: onNotificationRetry }),
    ...(notificationControlled
      ? {}
      : {
          onStateChange: async (
            eventId: string,
            state: 'READ' | 'ARCHIVED' | 'DISMISSED',
            expectedRevision: number,
          ) => {
            try {
              if (state === 'READ') await notificationResource.markRead(eventId, expectedRevision);
              else if (state === 'ARCHIVED')
                await notificationResource.archive(eventId, expectedRevision);
              else await notificationResource.dismiss(eventId, expectedRevision);
            } catch {
              // The store retains the error state and exposes retry through the center.
            }
          },
        }),
  };

  useEffect(() => {
    if (notificationsOpen) {
      notificationPanelRef.current?.focus();
    } else if (wasNotificationsOpenRef.current) {
      notificationTriggerRef.current?.focus();
    }
    wasNotificationsOpenRef.current = notificationsOpen;
  }, [notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeNotifications();
      }
    };
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !notificationPanelRef.current?.contains(target) &&
        !notificationTriggerRef.current?.contains(target)
      ) {
        closeNotifications();
        // The subsequent click can move focus to the page body after React unmounts the dialog.
        // Restore it once that click has completed so keyboard users remain at the trigger.
        setTimeout(() => notificationTriggerRef.current?.focus(), 0);
      }
    };
    document.addEventListener('keydown', handleDocumentKeyDown);
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
    };
  }, [closeNotifications, notificationsOpen]);

  return (
    <header className={`workspace-topbar${dashboardMode ? ' workspace-topbar--dashboard' : ''}`}>
      <div className="workspace-topbar__scope" aria-label={appMessage(locale, 'workspace.context')}>
        {dashboardMode ? (
          <nav
            aria-label={locale === 'vi-VN' ? 'Đường dẫn bảng điều khiển' : 'Dashboard breadcrumb'}
            className="workspace-topbar__dashboard-breadcrumb"
          >
            <span>{dashboardWorkspaceLabel}</span>
            <span aria-hidden="true">›</span>
            <strong>{locale === 'vi-VN' ? 'Bức tranh kinh doanh' : 'Business overview'}</strong>
          </nav>
        ) : (
          <>
            <dl>
              <div>
                <dt>{formatMessageV1(locale, 'scope.organization')}</dt>
                <dd>{organization?.name ?? appMessage(locale, 'context.organization')}</dd>
              </div>
              <div>
                <dt>{formatMessageV1(locale, 'scope.workspace')}</dt>
                <dd>{workspace?.name ?? appMessage(locale, 'context.workspace')}</dd>
              </div>
              <div>
                <dt>{formatMessageV1(locale, 'scope.project')}</dt>
                <dd>{project?.name ?? appMessage(locale, 'context.project')}</dd>
              </div>
            </dl>
            <WorkspaceSwitcher locale={locale} workspaces={workspaceOptions} />
          </>
        )}
        {localDemoMode ? (
          <span className="workspace-topbar__demo-badge">
            {isMobile ? 'Demo' : locale === 'vi-VN' ? 'Bản demo cục bộ' : 'Local demo data'}
          </span>
        ) : null}
      </div>
      <div className="workspace-topbar__actions">
        {isMobile ? (
          <Button
            aria-controls="primary-navigation"
            aria-expanded={mobileNavigationOpen}
            aria-label={appMessage(locale, mobileNavigationOpen ? 'nav.close' : 'nav.open')}
            className="icon-button workspace-topbar__menu"
            onClick={() => onMobileNavigationOpenChange(!mobileNavigationOpen)}
            variant="secondary"
          >
            {mobileNavigationOpen ? <XIcon /> : <MenuIcon />}
          </Button>
        ) : null}
        <WorkspaceLocaleMenu locale={locale} />
        {onSignOut === undefined ? null : (
          <Button
            aria-label={locale === 'vi-VN' ? 'Đăng xuất' : 'Sign out'}
            className="workspace-topbar__sign-out"
            onClick={() => void onSignOut()}
            type="button"
            variant="secondary"
          >
            {locale === 'vi-VN' ? 'Đăng xuất' : 'Sign out'}
          </Button>
        )}
        <Button
          aria-controls="workspace-notifications"
          aria-expanded={notificationsOpen}
          aria-haspopup="dialog"
          aria-label={notificationLabel}
          className="icon-button workspace-topbar__notification-trigger"
          onClick={() => setNotificationsOpen((open) => !open)}
          ref={notificationTriggerRef}
          variant="secondary"
        >
          <BellIcon />
          {unreadCount > 0 ? (
            <span aria-hidden="true" className="workspace-topbar__notification-badge">
              {unreadCount}
            </span>
          ) : null}
        </Button>
      </div>
      {notificationsOpen ? (
        <div
          aria-label={appMessage(locale, 'notifications.label')}
          className="workspace-topbar__notifications"
          id="workspace-notifications"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeNotifications();
            }
          }}
          ref={notificationPanelRef}
          role="dialog"
          tabIndex={-1}
        >
          <Button
            aria-label={appMessage(locale, 'notifications.close')}
            className="workspace-topbar__notification-close"
            onClick={closeNotifications}
            type="button"
            variant="secondary"
          >
            {appMessage(locale, 'notifications.close')}
          </Button>
          <NotificationCenter
            locale={locale}
            state={activeNotificationState}
            {...notificationCenterOptionalProperties}
          />
        </div>
      ) : null}
    </header>
  );
}
