import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import type { IamBootstrapValue } from '@databreeze/contracts/v4';
import { Button } from '@databreeze/ui/v1';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { appMessage } from '../app/messages.ts';
import { createAuthApiV1 } from '../features/auth/auth-api.ts';
import {
  fetchEntitlementSummary,
  type EntitlementSummaryV1,
} from '../features/usage/entitlement-api.ts';
import {
  DEFAULT_NOTIFICATION_STATE,
  getUnreadNotificationCount,
  notificationTriggerLabel,
  NotificationCenter,
  type NotificationCenterState,
} from '../features/notifications/notification-center.tsx';
import { useNotificationStoreResource } from '../features/notifications/notification-store.ts';
import { WorkspaceApiError, createWorkspaceApi } from '../features/workspace/workspace-api.ts';
import {
  WorkspaceSwitcher,
  type WorkspaceActionResult,
} from '../features/workspace/workspace-switcher.tsx';
import { WorkspaceSettingsDialog } from '../features/settings/workspace-settings-dialog.tsx';
import { BellIcon, LogOutIcon, MenuIcon, UserIcon, XIcon } from './icons.tsx';
import { WorkspaceLocaleMenu } from './workspace-locale-menu.tsx';

export interface WorkspaceTopbarProperties {
  readonly bootstrap?: IamBootstrapValue;
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

type AvatarCreditState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'ready'; readonly summary: EntitlementSummaryV1 }
  | { readonly status: 'error' };

function formatCreditNumber(locale: SupportedLocaleV1, value: number): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN').format(value);
}

/** WEB-013/014: workspace context and utility controls without the legacy global search strip. */
export function WorkspaceTopbar({
  bootstrap,
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
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [avatarCreditState, setAvatarCreditState] = useState<AvatarCreditState>({
    status: 'idle',
  });
  const notificationTriggerRef = useRef<HTMLButtonElement>(null);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const avatarTriggerRef = useRef<HTMLButtonElement>(null);
  const avatarDropdownRef = useRef<HTMLDivElement>(null);
  const wasSettingsDialogOpenRef = useRef(false);
  const wasNotificationsOpenRef = useRef(false);
  const localDemoMode = import.meta.env['VITE_DATABREEZE_DEMO_MODE'] === 'true';
  const configuredApiBaseUrl: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  const apiBaseUrl = typeof configuredApiBaseUrl === 'string' ? configuredApiBaseUrl : '';
  const scope = bootstrap?.session;
  const organization = bootstrap?.organizations.find((entry) => entry.id === scope?.organizationId);
  const workspace =
    scope?.scopeType === 'organization'
      ? undefined
      : organization?.workspaces.find((entry) => entry.id === scope?.workspaceId);
  const workspaceOptions =
    organization?.workspaces
      .filter((entry) => entry.status === 'ACTIVE')
      .map((entry) => ({ id: entry.id, name: entry.name })) ?? [];
  const authApi = useMemo(
    () =>
      createAuthApiV1({
        baseUrl: apiBaseUrl,
      }),
    [apiBaseUrl],
  );
  const workspaceApi = useMemo(
    () =>
      createWorkspaceApi({
        baseUrl: apiBaseUrl,
      }),
    [apiBaseUrl],
  );
  const workspaceActionError = useCallback(
    (error: unknown): WorkspaceActionResult => ({
      accepted: false,
      message:
        error instanceof WorkspaceApiError && error.status === 403
          ? locale === 'vi-VN'
            ? 'Bạn không có quyền tạo không gian làm việc trong tổ chức này.'
            : 'You do not have permission to create a workspace in this organization.'
          : locale === 'vi-VN'
            ? 'Không thể cập nhật không gian làm việc. Vui lòng thử lại.'
            : 'Could not update the workspace. Please try again.',
    }),
    [locale],
  );
  const switchWorkspace = useCallback(
    async (workspaceId: string): Promise<WorkspaceActionResult> => {
      const result = await authApi.switchWorkspace({ workspaceId });
      if (!result.accepted)
        return {
          accepted: false,
          message:
            locale === 'vi-VN'
              ? 'Không thể chuyển không gian làm việc. Vui lòng thử lại.'
              : 'Could not switch workspace. Please try again.',
        };
      setNotificationsOpen(false);
      void navigate(`/${locale}/dashboards`, { replace: true });
      return { accepted: true };
    },
    [authApi, locale, navigate],
  );
  const createWorkspace = useCallback(
    async (name: string): Promise<WorkspaceActionResult> => {
      if (organization === undefined)
        return {
          accepted: false,
          message:
            locale === 'vi-VN'
              ? 'Chưa xác định được tổ chức hiện tại.'
              : 'The current organization could not be identified.',
        };
      try {
        const created = await workspaceApi.createWorkspace(organization.id, name);
        return switchWorkspace(created.workspace.id);
      } catch (error) {
        return workspaceActionError(error);
      }
    },
    [locale, organization, switchWorkspace, workspaceActionError, workspaceApi],
  );
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

  const userDisplayName = bootstrap?.user.displayName ?? '';
  const userEmail = bootstrap?.user.email ?? '';
  const userInitials = userDisplayName
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  const closeAvatarMenu = useCallback(() => setAvatarMenuOpen(false), []);
  const closeSettingsDialog = useCallback(() => setSettingsDialogOpen(false), []);

  useEffect(() => {
    if (!settingsDialogOpen && wasSettingsDialogOpenRef.current) {
      avatarTriggerRef.current?.focus();
    }
    wasSettingsDialogOpenRef.current = settingsDialogOpen;
  }, [settingsDialogOpen]);

  useEffect(() => {
    if (!avatarMenuOpen || bootstrap === undefined) return;
    const controller = new AbortController();
    setAvatarCreditState({ status: 'loading' });
    void fetchEntitlementSummary({ baseUrl: apiBaseUrl }, controller.signal)
      .then((summary) => {
        if (!controller.signal.aborted) setAvatarCreditState({ status: 'ready', summary });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvatarCreditState({ status: 'error' });
      });
    return () => controller.abort();
  }, [apiBaseUrl, avatarMenuOpen, bootstrap]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAvatarMenu();
        avatarTriggerRef.current?.focus();
      }
    };
    const handleOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !avatarDropdownRef.current?.contains(target) &&
        !avatarTriggerRef.current?.contains(target)
      ) {
        closeAvatarMenu();
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('pointerdown', handleOutside);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('pointerdown', handleOutside);
    };
  }, [avatarMenuOpen, closeAvatarMenu]);

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
    <header className="workspace-topbar">
      <div className="workspace-topbar__scope" aria-label={appMessage(locale, 'workspace.context')}>
        <WorkspaceSwitcher
          {...(scope !== undefined && scope.scopeType !== 'organization'
            ? { currentWorkspaceId: scope.workspaceId }
            : {})}
          currentWorkspaceName={workspace?.name ?? appMessage(locale, 'context.workspace')}
          locale={locale}
          onCreate={createWorkspace}
          onSwitch={switchWorkspace}
          workspaces={workspaceOptions}
        />
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
        <Link className="workspace-topbar__upgrade" to={`/${locale}/billing`}>
          {locale === 'vi-VN' ? 'Nâng cấp ngay' : 'Upgrade now'}
        </Link>
        <WorkspaceLocaleMenu locale={locale} />
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
        {bootstrap !== undefined ? (
          <div className="workspace-topbar__avatar-menu">
            <button
              aria-controls="workspace-avatar-menu"
              aria-expanded={avatarMenuOpen}
              aria-haspopup="menu"
              aria-label={appMessage(locale, 'user.menu')}
              className="workspace-topbar__avatar-trigger"
              onClick={() => {
                setAvatarMenuOpen((open) => !open);
                setNotificationsOpen(false);
              }}
              ref={avatarTriggerRef}
              type="button"
            >
              {userInitials || '?'}
            </button>
            {avatarMenuOpen ? (
              <div
                className="workspace-topbar__avatar-dropdown"
                id="workspace-avatar-menu"
                ref={avatarDropdownRef}
                role="menu"
              >
                <div className="workspace-topbar__avatar-info">
                  <span className="workspace-topbar__avatar-info-circle" aria-hidden="true">
                    {userInitials || '?'}
                  </span>
                  <div className="workspace-topbar__avatar-info-text">
                    <span className="workspace-topbar__avatar-name">{userDisplayName}</span>
                    {userEmail ? (
                      <span className="workspace-topbar__avatar-email">{userEmail}</span>
                    ) : null}
                  </div>
                </div>
                <button
                  aria-controls="workspace-settings-dialog"
                  aria-haspopup="dialog"
                  className="workspace-topbar__avatar-action"
                  onClick={() => {
                    closeAvatarMenu();
                    setSettingsDialogOpen(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <UserIcon />
                  {appMessage(locale, 'user.profile')}
                </button>
                <Link
                  className="workspace-topbar__avatar-action"
                  onClick={closeAvatarMenu}
                  role="menuitem"
                  to={`/${locale}/billing`}
                >
                  {locale === 'vi-VN' ? 'Nâng cấp gói' : 'Upgrade plan'}
                </Link>
                <div className="workspace-topbar__avatar-divider" />
                <div
                  aria-label={appMessage(locale, 'user.aiCredits.heading')}
                  className="workspace-topbar__avatar-credits"
                  role="group"
                >
                  <span className="workspace-topbar__avatar-credits-heading">
                    {appMessage(locale, 'user.aiCredits.heading')}
                  </span>
                  {avatarCreditState.status === 'loading' || avatarCreditState.status === 'idle' ? (
                    <p className="workspace-topbar__avatar-credits-status" role="status">
                      {appMessage(locale, 'user.aiCredits.loading')}
                    </p>
                  ) : null}
                  {avatarCreditState.status === 'error' ? (
                    <p className="workspace-topbar__avatar-credits-status" role="alert">
                      {appMessage(locale, 'user.aiCredits.unavailable')}
                    </p>
                  ) : null}
                  {avatarCreditState.status === 'ready' ? (
                    <>
                      <div className="workspace-topbar__avatar-credits-remaining">
                        <strong>
                          {formatCreditNumber(
                            locale,
                            avatarCreditState.summary.aiCredits.remaining,
                          )}
                        </strong>
                        <span>{appMessage(locale, 'user.aiCredits.remaining')}</span>
                      </div>
                      <p className="workspace-topbar__avatar-credits-detail">
                        {formatCreditNumber(locale, avatarCreditState.summary.aiCredits.used)}{' '}
                        {appMessage(locale, 'user.aiCredits.used')} ·{' '}
                        {formatCreditNumber(locale, avatarCreditState.summary.aiCredits.reserved)}{' '}
                        {appMessage(locale, 'user.aiCredits.reserved')} ·{' '}
                        {formatCreditNumber(locale, avatarCreditState.summary.aiCredits.limit)}{' '}
                        {appMessage(locale, 'user.aiCredits.limit')}
                      </p>
                    </>
                  ) : null}
                </div>
                {onSignOut !== undefined ? (
                  <>
                    <div className="workspace-topbar__avatar-divider" />
                    <div
                      className="workspace-topbar__avatar-action"
                      role="menuitem"
                      tabIndex={0}
                      onClick={() => {
                        closeAvatarMenu();
                        void onSignOut();
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        closeAvatarMenu();
                        void onSignOut();
                      }}
                    >
                      <LogOutIcon />
                      {appMessage(locale, 'user.signOut')}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
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
      {settingsDialogOpen ? (
        <WorkspaceSettingsDialog locale={locale} onClose={closeSettingsDialog} />
      ) : null}
    </header>
  );
}
