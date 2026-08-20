import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { appMessage } from '../../app/messages.ts';
import { dashboardDemoMode } from '../dashboards/dashboard-api.ts';
import {
  inviteWorkspaceMember,
  fetchNotificationPreferences,
  setAccessPreset,
  setAgentGrant,
  updateAccountProfile,
  updateNotificationPreferences,
  useWorkspaceSettingsResource,
  type NotificationPreferencesSnapshot,
  type WorkspaceMemberProjection,
  type WorkspaceSettingsProjection,
  type WorkspaceSettingsState,
} from './settings-api.ts';
import { MemberAccessTable, type MemberAccessRow } from './member-access-table.tsx';
import { SessionList, type SessionRow } from './session-list.tsx';
import { NotificationPreferencesSection } from './notification-preferences-section.tsx';
import { BellIcon, SettingsIcon, UserIcon } from '../../components/icons.tsx';
import {
  currentAuthBootstrapV1,
  currentSessionIdV1,
  rememberAuthBootstrapV1,
} from '../auth/auth-session.ts';
import { createAuthApiV1 } from '../auth/auth-api.ts';
import './workspace-settings.css';

const DEMO_WORKSPACE_ID = '00000000-0000-4000-8000-000000000401';
const DEMO_MEMBER_ID = '00000000-0000-4000-8000-000000000402';

const DEMO_WORKSPACE_SETTINGS: WorkspaceSettingsProjection = Object.freeze({
  workspaceId: DEMO_WORKSPACE_ID,
  canManage: true,
  members: Object.freeze([
    Object.freeze({
      memberId: DEMO_MEMBER_ID,
      displayName: 'Mai Quỳnh',
      accessPreset: 'OWNER',
      agentGrantLevel: 'APPLY_CONFIRMED_CHANGES',
      agentGrantRevision: 1,
      membershipRevision: 1,
    }),
  ]),
});

function demoSessions(locale: SupportedLocaleV1): readonly SessionRow[] {
  return Object.freeze([
    Object.freeze({
      sessionId: '00000000-0000-4000-8000-000000000403',
      deviceLabel:
        locale === 'vi-VN'
          ? 'Chrome · Windows · Phiên hiện tại'
          : 'Chrome · Windows · Current session',
      current: true,
    }),
  ]);
}

export interface WorkspaceSettingsPageProperties {
  readonly locale: SupportedLocaleV1;
  readonly presentation?: 'page' | 'dialog';
  /** Local QA uses Mailpit; deployed environments use their configured delivery provider. */
  readonly localDelivery?: boolean;
  /** Controlled compatibility input for focused presentation tests and embedded settings shells. */
  readonly canManage?: boolean;
  readonly projection?: WorkspaceSettingsProjection;
  readonly state?: WorkspaceSettingsState;
  readonly onRetry?: () => void;
  readonly mutationStatus?: 'idle' | 'saving' | 'success' | 'error';
  readonly mutationError?: string;
  readonly sessions?: readonly SessionRow[];
  readonly onAgentGrantChange?: (
    memberId: string,
    level: NonNullable<MemberAccessRow['agentGrant']>,
    expectedRevision: number,
  ) => void;
  readonly onAccessPresetChange?: (
    memberId: string,
    preset: 'OWNER' | 'EDITOR' | 'VIEWER',
    expectedRevision: number,
  ) => void;
  readonly onInviteMember?: (email: string, preset: 'EDITOR' | 'VIEWER') => Promise<void>;
  readonly profileDisplayName?: string;
  readonly profileLocale?: SupportedLocaleV1;
  readonly profileRevision?: number;
  readonly onProfileSave?: (input: {
    readonly displayName: string;
    readonly locale: SupportedLocaleV1;
    readonly expectedRevision: number;
  }) => Promise<void>;
  readonly notificationPreferences?: NotificationPreferencesSnapshot;
  readonly notificationPreferencesState?: 'loading' | 'ready' | 'error' | 'unavailable';
  readonly notificationPreferencesError?: string;
  readonly onNotificationPreferencesSave?: (
    snapshot: NotificationPreferencesSnapshot,
  ) => Promise<void>;
}

function CompactSettingRow({
  children,
  description,
  label,
  name,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly label: string;
  readonly name: string;
}) {
  return (
    <div className="workspace-settings-compact__row" data-settings-compact-row={name}>
      <div className="workspace-settings-compact__copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <div className="workspace-settings-compact__control">{children}</div>
    </div>
  );
}

function rowsFromProjection(
  projection: WorkspaceSettingsProjection | undefined,
): readonly MemberAccessRow[] {
  return (
    projection?.members.map((member: WorkspaceMemberProjection) => ({
      memberId: member.memberId,
      displayName: member.displayName,
      preset: member.accessPreset,
      agentGrant: member.agentGrantLevel,
      agentGrantRevision: member.agentGrantRevision,
      membershipRevision: member.membershipRevision,
    })) ?? []
  );
}

type WorkspaceSettingsTopic = 'account' | 'members' | 'notifications' | 'security';

function WorkspaceSettingsTopicIcon({ topic }: { readonly topic: WorkspaceSettingsTopic }) {
  const properties = { className: 'workspace-settings-page__topic-icon-svg', focusable: false };
  if (topic === 'notifications') return <BellIcon {...properties} />;
  if (topic === 'security') return <SettingsIcon {...properties} />;
  return <UserIcon {...properties} />;
}

export function WorkspaceSettingsPage({
  locale,
  presentation = 'page',
  localDelivery = false,
  canManage,
  projection,
  state,
  onRetry,
  mutationStatus = 'idle',
  mutationError,
  sessions = [],
  onAgentGrantChange,
  onAccessPresetChange,
  onInviteMember,
  profileDisplayName,
  profileLocale,
  profileRevision,
  onProfileSave,
  notificationPreferences,
  notificationPreferencesState = 'unavailable',
  notificationPreferencesError,
  onNotificationPreferencesSave,
}: WorkspaceSettingsPageProperties) {
  const controlled = canManage !== undefined || projection !== undefined || state !== undefined;
  const live = useWorkspaceSettingsResource(!controlled);
  const resolvedState: WorkspaceSettingsState =
    state ??
    (projection === undefined
      ? {
          status: 'ready',
          projection: {
            workspaceId: '00000000-0000-4000-8000-000000000000',
            canManage: canManage ?? false,
            members: [],
          },
        }
      : { status: 'ready', projection });
  const activeState = controlled ? resolvedState : live.state;
  const activeProjection = activeState.projection;
  const activeCanManage = canManage ?? activeProjection?.canManage ?? false;
  const retry = onRetry ?? live.retry;
  const authBootstrap = currentAuthBootstrapV1();
  const accountName =
    authBootstrap?.user.displayName ??
    (controlled ? 'DataBreeze account' : 'Authenticated account');
  const mfaState = authBootstrap?.user.mfaState;
  const [profileName, setProfileName] = useState(
    profileDisplayName ?? authBootstrap?.user.displayName ?? accountName,
  );
  const [profileLanguage, setProfileLanguage] = useState<SupportedLocaleV1>(
    profileLocale ?? authBootstrap?.user.locale ?? locale,
  );
  const [profileSaveState, setProfileSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle',
  );
  const [profileSaveError, setProfileSaveError] = useState<string>();
  const resolvedProfileRevision = profileRevision ?? authBootstrap?.user.profileRevision ?? 1;
  const [activeTopic, setActiveTopic] = useState<WorkspaceSettingsTopic>('account');
  useEffect(() => {
    setProfileName(profileDisplayName ?? authBootstrap?.user.displayName ?? accountName);
    setProfileLanguage(profileLocale ?? authBootstrap?.user.locale ?? locale);
  }, [
    accountName,
    authBootstrap?.user.displayName,
    authBootstrap?.user.locale,
    profileDisplayName,
    profileLocale,
    locale,
  ]);

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onProfileSave === undefined) return;
    setProfileSaveState('saving');
    setProfileSaveError(undefined);
    try {
      await onProfileSave({
        displayName: profileName,
        locale: profileLanguage,
        expectedRevision: resolvedProfileRevision,
      });
      setProfileSaveState('success');
    } catch (error) {
      setProfileSaveState('error');
      setProfileSaveError(error instanceof Error ? error.message : 'PROFILE_UPDATE_FAILED');
    }
  }
  const accountSection = (
    <section className="workspace-settings-page__section workspace-settings-page__section--account">
      <div className="workspace-settings-page__section-heading">
        <div>
          <p>{locale === 'vi-VN' ? 'Tài khoản của bạn' : 'Your account'}</p>
          <h2>{locale === 'vi-VN' ? 'Danh tính và bảo mật' : 'Identity and security'}</h2>
        </div>
        <span>
          {locale === 'vi-VN'
            ? 'Lấy từ phiên đã xác thực'
            : 'Derived from your authenticated session'}
        </span>
      </div>
      <div className="workspace-account-grid">
        <article>
          <span>{locale === 'vi-VN' ? 'Tên hiển thị' : 'Display name'}</span>
          <strong>{accountName}</strong>
          <small>
            {locale === 'vi-VN'
              ? 'Tên này được quản lý bởi danh tính tài khoản.'
              : 'Managed by your account identity.'}
          </small>
        </article>
        <article>
          <span>{locale === 'vi-VN' ? 'Email tài khoản' : 'Account email'}</span>
          <strong>{authBootstrap?.user.email ?? '—'}</strong>
          <small>
            {locale === 'vi-VN'
              ? 'Email chỉ được hiển thị từ phiên đã xác thực.'
              : 'Shown only from the authenticated session.'}
          </small>
        </article>
        <article>
          <span>{locale === 'vi-VN' ? 'Xác thực đa yếu tố' : 'Multi-factor authentication'}</span>
          <strong>
            {mfaState === 'ENABLED'
              ? locale === 'vi-VN'
                ? 'Đã bật'
                : 'Enabled'
              : locale === 'vi-VN'
                ? 'Chưa cấu hình'
                : 'Not configured'}
          </strong>
          <small>
            {locale === 'vi-VN'
              ? 'Mọi thay đổi quyền vẫn cần phiên hợp lệ.'
              : 'Permission changes still require a valid session.'}
          </small>
        </article>
        <article>
          <span>{locale === 'vi-VN' ? 'Phiên hiện tại' : 'Current session'}</span>
          <strong>
            {sessions.length > 0
              ? locale === 'vi-VN'
                ? 'Đang hoạt động'
                : 'Active now'
              : locale === 'vi-VN'
                ? 'Đang tải'
                : 'Loading'}
          </strong>
          <small>
            {locale === 'vi-VN'
              ? 'Phiên trình duyệt hiện tại được hiển thị từ máy chủ. Đăng xuất để kết thúc phiên này.'
              : 'The current browser session is shown from the server. Sign out to end this session.'}
          </small>
        </article>
      </div>
      <form className="workspace-profile-form" onSubmit={(event) => void submitProfile(event)}>
        <div className="workspace-profile-form__heading">
          <div>
            <strong>{locale === 'vi-VN' ? 'Tùy chỉnh hồ sơ' : 'Profile preferences'}</strong>
            <small>
              {locale === 'vi-VN'
                ? 'Chỉ tên hiển thị và ngôn ngữ được cập nhật; email và quyền luôn do máy chủ quản lý.'
                : 'Only your display name and language can change here; email and permissions stay server-owned.'}
            </small>
          </div>
          <span>
            {locale === 'vi-VN'
              ? `Phiên bản ${resolvedProfileRevision}`
              : `Revision ${resolvedProfileRevision}`}
          </span>
        </div>
        <div className="workspace-profile-form__fields">
          <label>
            <span>{locale === 'vi-VN' ? 'Tên hiển thị' : 'Display name'}</span>
            <input
              disabled={onProfileSave === undefined || profileSaveState === 'saving'}
              maxLength={200}
              onChange={(event) => setProfileName(event.target.value)}
              required
              value={profileName}
            />
          </label>
          <label>
            <span>{locale === 'vi-VN' ? 'Ngôn ngữ' : 'Language'}</span>
            <select
              disabled={onProfileSave === undefined || profileSaveState === 'saving'}
              onChange={(event) => setProfileLanguage(event.target.value as SupportedLocaleV1)}
              value={profileLanguage}
            >
              <option value="vi-VN">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
          <button
            className="workspace-profile-form__save"
            disabled={onProfileSave === undefined || profileSaveState === 'saving'}
            type="submit"
          >
            {profileSaveState === 'saving'
              ? locale === 'vi-VN'
                ? 'Đang lưu…'
                : 'Saving…'
              : locale === 'vi-VN'
                ? 'Lưu hồ sơ'
                : 'Save profile'}
          </button>
        </div>
        {profileSaveState === 'success' ? (
          <p className="workspace-profile-form__success" role="status">
            {locale === 'vi-VN' ? 'Đã lưu hồ sơ.' : 'Profile saved.'}
          </p>
        ) : null}
        {profileSaveState === 'error' ? (
          <p className="workspace-profile-form__error" role="alert">
            {profileSaveError === 'PROFILE_REVISION_CONFLICT'
              ? locale === 'vi-VN'
                ? 'Hồ sơ đã thay đổi ở nơi khác. Hãy tải lại rồi thử lại.'
                : 'This profile changed elsewhere. Reload and try again.'
              : profileSaveError === 'PROFILE_FORBIDDEN'
                ? locale === 'vi-VN'
                  ? 'Phiên hiện tại không có quyền cập nhật hồ sơ.'
                  : 'This session cannot update the profile.'
                : profileSaveError === 'PROFILE_UNAVAILABLE'
                  ? locale === 'vi-VN'
                    ? 'Dịch vụ hồ sơ tạm thời chưa khả dụng.'
                    : 'Profile service is temporarily unavailable.'
                  : locale === 'vi-VN'
                    ? 'Không thể lưu hồ sơ. Vui lòng thử lại.'
                    : 'The profile could not be saved. Please try again.'}
          </p>
        ) : null}
      </form>
      <div
        className="workspace-account-actions"
        aria-label={locale === 'vi-VN' ? 'Tác vụ tài khoản' : 'Account actions'}
      >
        <div className="workspace-account-action">
          <div>
            <strong>{locale === 'vi-VN' ? 'Đổi mật khẩu' : 'Change password'}</strong>
            <small>
              {locale === 'vi-VN'
                ? 'Nhận liên kết đặt lại qua email. DataBreeze không hiển thị mật khẩu hiện tại.'
                : 'Request a secure reset link. DataBreeze never reveals your current password.'}
            </small>
          </div>
          <Link className="workspace-account-action__link" to={`/${locale}/forgot-password`}>
            {locale === 'vi-VN' ? 'Mở đặt lại mật khẩu' : 'Open password reset'}
          </Link>
        </div>
        <div className="workspace-account-action">
          <div>
            <strong>{locale === 'vi-VN' ? 'Ngôn ngữ giao diện' : 'Interface language'}</strong>
            <small>
              {locale === 'vi-VN'
                ? 'Tiếng Việt là ngôn ngữ mặc định. Chuyển sang English mà không đổi dữ liệu nghiệp vụ.'
                : 'Vietnamese is the default. Switch to Vietnamese without changing business data.'}
            </small>
          </div>
          <Link
            className="workspace-account-action__link"
            to={`/${locale === 'vi-VN' ? 'en' : 'vi-VN'}/settings`}
          >
            {locale === 'vi-VN' ? 'English' : 'Tiếng Việt'}
          </Link>
        </div>
        <div className="workspace-account-action workspace-account-action--muted">
          <div>
            <strong>{locale === 'vi-VN' ? 'Đăng ký MFA' : 'Enroll MFA'}</strong>
            <small>
              {locale === 'vi-VN'
                ? 'Trạng thái được lấy từ IAM. Luồng xác minh chỉ mở khi máy chủ đã cấu hình bộ xác minh an toàn.'
                : 'Status comes from IAM. Enrollment opens only when the server has a safe proof provider configured.'}
            </small>
          </div>
          <span className="workspace-account-action__state">
            {mfaState === 'ENABLED'
              ? locale === 'vi-VN'
                ? 'Đã bật'
                : 'Enabled'
              : locale === 'vi-VN'
                ? 'Chưa khả dụng'
                : 'Unavailable'}
          </span>
        </div>
      </div>
    </section>
  );
  const compactAccountSection = (
    <section className="workspace-settings-compact__section" data-settings-compact-group="account">
      <div className="workspace-settings-compact__rows">
        <CompactSettingRow
          description={
            locale === 'vi-VN'
              ? 'Danh tính đang dùng trong phiên đã xác thực.'
              : 'Identity used by the authenticated session.'
          }
          label={locale === 'vi-VN' ? 'Tài khoản' : 'Account'}
          name="account-identity"
        >
          <strong className="workspace-settings-compact__value">{accountName}</strong>
        </CompactSettingRow>
        <CompactSettingRow
          description={
            locale === 'vi-VN'
              ? 'Nhận liên kết đặt lại qua email. Mật khẩu hiện tại không được hiển thị.'
              : 'Request a secure reset link. Your current password is never shown.'
          }
          label={locale === 'vi-VN' ? 'Đổi mật khẩu' : 'Change password'}
          name="change-password"
        >
          <Link className="workspace-settings-compact__action" to={`/${locale}/forgot-password`}>
            {locale === 'vi-VN' ? 'Mở đặt lại' : 'Open reset'}
          </Link>
        </CompactSettingRow>
        <CompactSettingRow
          description={
            locale === 'vi-VN'
              ? 'Email chỉ được hiển thị từ phiên đã xác thực.'
              : 'Shown only from the authenticated session.'
          }
          label={locale === 'vi-VN' ? 'Email tài khoản' : 'Account email'}
          name="account-email"
        >
          <strong className="workspace-settings-compact__value">
            {authBootstrap?.user.email ?? '—'}
          </strong>
        </CompactSettingRow>
      </div>
      <form
        className="workspace-settings-compact__rows"
        onSubmit={(event) => void submitProfile(event)}
      >
        <CompactSettingRow
          description={
            locale === 'vi-VN'
              ? 'Tên này được hiển thị trong workspace và có thể cập nhật cùng ngôn ngữ.'
              : 'Shown in the workspace and saved together with your language preference.'
          }
          label={locale === 'vi-VN' ? 'Tùy chỉnh hồ sơ' : 'Profile preferences'}
          name="profile-preferences"
        >
          <div className="workspace-settings-compact__control-group">
            <input
              aria-label={locale === 'vi-VN' ? 'Tên hiển thị' : 'Display name'}
              disabled={onProfileSave === undefined || profileSaveState === 'saving'}
              maxLength={200}
              onChange={(event) => setProfileName(event.target.value)}
              required
              value={profileName}
            />
            <select
              aria-label={locale === 'vi-VN' ? 'Ngôn ngữ' : 'Language'}
              disabled={onProfileSave === undefined || profileSaveState === 'saving'}
              onChange={(event) => setProfileLanguage(event.target.value as SupportedLocaleV1)}
              value={profileLanguage}
            >
              <option value="vi-VN">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
        </CompactSettingRow>
        <CompactSettingRow
          description={
            locale === 'vi-VN'
              ? `Lưu theo phiên bản ${resolvedProfileRevision}.`
              : `Saved against revision ${resolvedProfileRevision}.`
          }
          label={locale === 'vi-VN' ? 'Lưu thay đổi' : 'Save changes'}
          name="profile-save"
        >
          <button
            className="workspace-settings-compact__action workspace-settings-compact__action--primary"
            disabled={onProfileSave === undefined || profileSaveState === 'saving'}
            type="submit"
          >
            {profileSaveState === 'saving'
              ? locale === 'vi-VN'
                ? 'Đang lưu…'
                : 'Saving…'
              : locale === 'vi-VN'
                ? 'Lưu hồ sơ'
                : 'Save profile'}
          </button>
        </CompactSettingRow>
        {profileSaveState === 'success' ? (
          <p
            className="workspace-settings-compact__status workspace-settings-compact__status--success"
            role="status"
          >
            {locale === 'vi-VN' ? 'Đã lưu hồ sơ.' : 'Profile saved.'}
          </p>
        ) : null}
        {profileSaveState === 'error' ? (
          <p
            className="workspace-settings-compact__status workspace-settings-compact__status--error"
            role="alert"
          >
            {profileSaveError === 'PROFILE_REVISION_CONFLICT'
              ? locale === 'vi-VN'
                ? 'Hồ sơ đã thay đổi ở nơi khác. Hãy tải lại rồi thử lại.'
                : 'This profile changed elsewhere. Reload and try again.'
              : locale === 'vi-VN'
                ? 'Không thể lưu hồ sơ. Vui lòng thử lại.'
                : 'The profile could not be saved. Please try again.'}
          </p>
        ) : null}
      </form>
      <div className="workspace-settings-compact__rows">
        <CompactSettingRow
          description={
            locale === 'vi-VN'
              ? 'Luồng xác minh chỉ mở khi máy chủ đã cấu hình bộ xác minh an toàn.'
              : 'Enrollment opens only when the server has a safe proof provider configured.'
          }
          label={locale === 'vi-VN' ? 'Xác thực đa yếu tố' : 'Multi-factor authentication'}
          name="mfa"
        >
          <span className="workspace-settings-compact__value">
            {mfaState === 'ENABLED'
              ? locale === 'vi-VN'
                ? 'Đã bật'
                : 'Enabled'
              : locale === 'vi-VN'
                ? 'Chưa khả dụng'
                : 'Unavailable'}
          </span>
        </CompactSettingRow>
        <CompactSettingRow
          description={
            locale === 'vi-VN'
              ? 'Phiên trình duyệt hiện tại được hiển thị từ máy chủ.'
              : 'The current browser session is shown from the server.'
          }
          label={locale === 'vi-VN' ? 'Phiên hiện tại' : 'Current session'}
          name="current-session"
        >
          <span className="workspace-settings-compact__value">
            {sessions.length > 0
              ? locale === 'vi-VN'
                ? 'Đang hoạt động'
                : 'Active now'
              : locale === 'vi-VN'
                ? 'Đang tải'
                : 'Loading'}
          </span>
        </CompactSettingRow>
      </div>
    </section>
  );
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePreset, setInvitePreset] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [inviteState, setInviteState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [inviteError, setInviteError] = useState<string>();

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onInviteMember === undefined) return;
    setInviteState('sending');
    setInviteError(undefined);
    try {
      await onInviteMember(inviteEmail, invitePreset);
      setInviteEmail('');
      setInviteState('sent');
    } catch (error) {
      setInviteState('error');
      setInviteError(error instanceof Error ? error.message : 'INVITATION_FAILED');
    }
  }

  const showNotificationTopic =
    notificationPreferencesState !== 'unavailable' ||
    notificationPreferences !== undefined ||
    onNotificationPreferencesSave !== undefined ||
    notificationPreferencesError !== undefined;
  const topicOptions: readonly {
    readonly id: WorkspaceSettingsTopic;
    readonly label: string;
  }[] = [
    {
      id: 'account',
      label: locale === 'vi-VN' ? 'Tài khoản' : 'Account',
    },
    ...(activeState.status === 'ready'
      ? [
          {
            id: 'members' as const,
            label: locale === 'vi-VN' ? 'Thành viên và quyền' : 'Members and access',
          },
        ]
      : []),
    ...(showNotificationTopic
      ? [
          {
            id: 'notifications' as const,
            label: locale === 'vi-VN' ? 'Thông báo' : 'Notifications',
          },
        ]
      : []),
    ...(activeState.status === 'ready'
      ? [
          {
            id: 'security' as const,
            label: locale === 'vi-VN' ? 'Bảo mật và phiên' : 'Security and sessions',
          },
        ]
      : []),
  ];
  const selectedTopic = topicOptions.some((topic) => topic.id === activeTopic)
    ? activeTopic
    : 'account';

  function handleTopicKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? (index + 1) % topicOptions.length
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? (index - 1 + topicOptions.length) % topicOptions.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? topicOptions.length - 1
              : undefined;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextTopic = topicOptions[nextIndex];
    if (nextTopic === undefined) return;
    setActiveTopic(nextTopic.id);
    document.querySelector<HTMLElement>(`[data-settings-topic="${nextTopic.id}"]`)?.focus();
  }

  const notificationsSection = showNotificationTopic ? (
    <NotificationPreferencesSection
      compact={presentation === 'dialog'}
      locale={locale}
      state={notificationPreferencesState}
      {...(onNotificationPreferencesSave === undefined
        ? {}
        : { onSave: onNotificationPreferencesSave })}
      {...(notificationPreferencesError === undefined
        ? {}
        : { error: notificationPreferencesError })}
      {...(notificationPreferences === undefined ? {} : { snapshot: notificationPreferences })}
    />
  ) : null;

  const membersSection = (
    <>
      <section className="workspace-settings-page__section">
        <div className="workspace-settings-page__section-heading">
          <div>
            <p>{locale === 'vi-VN' ? 'Quyền truy cập' : 'Access control'}</p>
            <h2>{appMessage(locale, 'settings.workspace.members')}</h2>
          </div>
          <span>
            {locale === 'vi-VN'
              ? 'Thay đổi được kiểm soát theo phiên bản'
              : 'Revision-controlled changes'}
          </span>
        </div>
        <div className="workspace-settings-page__table-wrap">
          <MemberAccessTable
            canManage={activeCanManage}
            locale={locale}
            rows={rowsFromProjection(activeProjection)}
            {...(onAgentGrantChange === undefined ? {} : { onAgentGrantChange })}
            {...(onAccessPresetChange === undefined ? {} : { onAccessPresetChange })}
          />
        </div>
      </section>
      {activeCanManage && onInviteMember ? (
        <section className="workspace-settings-page__section workspace-settings-page__section--invite">
          <div className="workspace-settings-page__section-heading">
            <div>
              <p>{locale === 'vi-VN' ? 'Mời cộng tác viên' : 'Invite a collaborator'}</p>
              <h2>
                {locale === 'vi-VN' ? 'Thêm người vào workspace' : 'Add someone to this workspace'}
              </h2>
            </div>
            <span>
              {localDelivery
                ? locale === 'vi-VN'
                  ? 'Email local sẽ xuất hiện trong Mailpit'
                  : 'Local email appears in Mailpit'
                : locale === 'vi-VN'
                  ? 'Email được gửi qua nhà cung cấp đã cấu hình'
                  : 'Email is delivered through the configured provider'}
            </span>
          </div>
          <form className="workspace-invite-form" onSubmit={(event) => void submitInvite(event)}>
            <label>
              <span>{locale === 'vi-VN' ? 'Email tài khoản' : 'Account email'}</span>
              <input
                autoComplete="email"
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder={locale === 'vi-VN' ? 'ten@congty.vn' : 'name@company.com'}
                required
                type="email"
                value={inviteEmail}
              />
              <small className="workspace-invite-form__hint">
                {locale === 'vi-VN'
                  ? 'Tài khoản cần đăng ký DataBreeze trước; email mời local sẽ xuất hiện trong Mailpit.'
                  : 'The person must already have a DataBreeze account; local invitation email appears in Mailpit.'}
              </small>
            </label>
            <label>
              <span>{locale === 'vi-VN' ? 'Quyền mặc định' : 'Default access'}</span>
              <select
                onChange={(event) => setInvitePreset(event.target.value as 'EDITOR' | 'VIEWER')}
                value={invitePreset}
              >
                <option value="EDITOR">{locale === 'vi-VN' ? 'Biên tập viên' : 'Editor'}</option>
                <option value="VIEWER">{locale === 'vi-VN' ? 'Người xem' : 'Viewer'}</option>
              </select>
            </label>
            <button disabled={inviteState === 'sending'} type="submit">
              {inviteState === 'sending'
                ? locale === 'vi-VN'
                  ? 'Đang gửi…'
                  : 'Sending…'
                : locale === 'vi-VN'
                  ? 'Gửi lời mời'
                  : 'Send invite'}
            </button>
          </form>
          {inviteState === 'sent' ? (
            <p className="workspace-invite-form__success" role="status">
              {locale === 'vi-VN'
                ? 'Đã gửi lời mời. Kiểm tra Mailpit để mở liên kết.'
                : 'Invitation sent. Open Mailpit to test the link.'}
            </p>
          ) : null}
          {inviteState === 'error' ? (
            <p className="workspace-invite-form__error" role="alert">
              {inviteError === 'NOT_FOUND'
                ? locale === 'vi-VN'
                  ? 'Không tìm thấy tài khoản đã đăng ký với email này.'
                  : 'No active DataBreeze account uses this email.'
                : inviteError === 'CONFLICT'
                  ? locale === 'vi-VN'
                    ? 'Người này đã được mời hoặc đã ở trong workspace.'
                    : 'This person is already invited or already a member.'
                  : locale === 'vi-VN'
                    ? 'Không thể gửi lời mời. Vui lòng thử lại.'
                    : 'The invitation could not be sent. Please try again.'}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );

  const securitySection = (
    <section className="workspace-settings-page__section">
      <div className="workspace-settings-page__section-heading">
        <div>
          <p>{locale === 'vi-VN' ? 'Bảo mật' : 'Security'}</p>
          <h2>{appMessage(locale, 'settings.workspace.sessions')}</h2>
        </div>
        <span>
          {locale === 'vi-VN'
            ? 'Theo dõi các phiên đã xác thực'
            : 'Keep track of authenticated sessions'}
        </span>
      </div>
      <SessionList locale={locale} sessions={sessions} />
    </section>
  );
  const compactMembersSection = (
    <div className="workspace-settings-compact__section workspace-settings-compact__section--members">
      {membersSection}
    </div>
  );
  const compactNotificationsSection = notificationsSection ? (
    <div className="workspace-settings-compact__section workspace-settings-compact__section--notifications">
      {notificationsSection}
    </div>
  ) : null;
  const compactSecuritySection = (
    <div className="workspace-settings-compact__section workspace-settings-compact__section--security">
      {securitySection}
    </div>
  );
  const topicPanel = (compact: boolean) => (
    <div
      aria-labelledby={`workspace-settings-topic-${selectedTopic}`}
      className="workspace-settings-page__tabpanel"
      {...(compact ? { 'data-settings-compact': 'true' } : {})}
      id={`workspace-settings-panel-${selectedTopic}`}
      role="tabpanel"
      tabIndex={0}
    >
      <h2 className="workspace-settings-page__tabpanel-heading">
        {topicOptions.find((topic) => topic.id === selectedTopic)?.label}
      </h2>
      {selectedTopic === 'account' ? (compact ? compactAccountSection : accountSection) : null}
      {selectedTopic === 'members' ? (compact ? compactMembersSection : membersSection) : null}
      {selectedTopic === 'notifications'
        ? compact
          ? compactNotificationsSection
          : notificationsSection
        : null}
      {selectedTopic === 'security' ? (compact ? compactSecuritySection : securitySection) : null}
    </div>
  );

  return (
    <section
      aria-label={appMessage(locale, 'settings.workspace.title')}
      className={`workspace-settings-page${presentation === 'dialog' ? ' workspace-settings-page--dialog' : ''}`}
    >
      {presentation === 'page' ? (
        <header className="workspace-settings-page__hero">
          <div>
            <p className="workspace-settings-page__eyebrow">
              {locale === 'vi-VN' ? 'Quản trị · Không gian làm việc' : 'Administration · Workspace'}
            </p>
            <h1>{appMessage(locale, 'settings.workspace.title')}</h1>
            <p className="workspace-settings-page__intro">
              {locale === 'vi-VN'
                ? 'Quản lý thành viên, phạm vi trợ lý và các phiên đăng nhập từ một nơi.'
                : 'Manage members, agent scope, and active sessions from one place.'}
            </p>
          </div>
          <div className="workspace-settings-page__hero-actions">
            <Link className="workspace-settings-page__hero-link" to={`/${locale}/usage`}>
              {locale === 'vi-VN' ? 'Xem tín dụng AI' : 'View AI credits'}
            </Link>
            <Link
              className="workspace-settings-page__hero-link workspace-settings-page__hero-link--primary"
              to={`/${locale}/billing`}
            >
              {locale === 'vi-VN' ? 'Gói dịch vụ' : 'Plans & billing'}
            </Link>
            {activeState.status === 'ready' ? (
              <span className="workspace-settings-page__status">
                {activeCanManage
                  ? locale === 'vi-VN'
                    ? 'Quyền chủ sở hữu'
                    : 'Owner access'
                  : locale === 'vi-VN'
                    ? 'Chỉ xem'
                    : 'Read only'}
              </span>
            ) : null}
          </div>
        </header>
      ) : null}
      <div className="workspace-settings-page__surface">
        <aside
          aria-label={locale === 'vi-VN' ? 'Chủ đề quản trị' : 'Administration topics'}
          className="workspace-settings-page__navigation"
        >
          <div className="workspace-settings-page__navigation-heading">
            <span>{locale === 'vi-VN' ? 'Không gian làm việc' : 'Workspace'}</span>
            <strong>{locale === 'vi-VN' ? 'Quản trị' : 'Administration'}</strong>
          </div>
          <div
            aria-label={locale === 'vi-VN' ? 'Chủ đề quản trị' : 'Administration topics'}
            aria-orientation="vertical"
            className="workspace-settings-page__topic-list"
            role="tablist"
          >
            {topicOptions.map((topic, index) => (
              <button
                aria-controls={`workspace-settings-panel-${topic.id}`}
                aria-selected={selectedTopic === topic.id}
                className="workspace-settings-page__topic"
                data-settings-topic={topic.id}
                id={`workspace-settings-topic-${topic.id}`}
                key={topic.id}
                onClick={() => setActiveTopic(topic.id)}
                onKeyDown={(event) => handleTopicKeyDown(event, index)}
                role="tab"
                tabIndex={selectedTopic === topic.id ? 0 : -1}
                type="button"
              >
                <span aria-hidden="true" data-settings-topic-icon={topic.id}>
                  <WorkspaceSettingsTopicIcon topic={topic.id} />
                </span>
                <strong>{topic.label}</strong>
              </button>
            ))}
          </div>
          <p className="workspace-settings-page__navigation-note">
            {locale === 'vi-VN'
              ? 'Các thay đổi nhạy cảm vẫn được máy chủ kiểm tra theo phiên và phiên bản.'
              : 'Sensitive changes remain checked by the server against your session and revision.'}
          </p>
        </aside>
        <div
          className="workspace-settings-page__content"
          {...(presentation === 'dialog' ? { 'data-settings-dialog-content': 'true' } : {})}
        >
          {mutationStatus !== 'idle' ? (
            <p
              className={`workspace-settings-page__mutation workspace-settings-page__mutation--${mutationStatus}`}
              role={mutationStatus === 'error' ? 'alert' : 'status'}
            >
              {mutationStatus === 'saving'
                ? locale === 'vi-VN'
                  ? 'Đang lưu thay đổi…'
                  : 'Saving changes…'
                : mutationStatus === 'success'
                  ? locale === 'vi-VN'
                    ? 'Đã cập nhật quyền thành công.'
                    : 'Access settings updated.'
                  : mutationError === 'REVISION_CONFLICT'
                    ? locale === 'vi-VN'
                      ? 'Cài đặt đã thay đổi ở nơi khác. Đã tải lại dữ liệu mới nhất; hãy thử lại.'
                      : 'These settings changed elsewhere. The latest version is loaded; try again.'
                    : locale === 'vi-VN'
                      ? 'Không thể cập nhật quyền lúc này. Vui lòng thử lại.'
                      : 'The access update could not be saved. Please try again.'}
            </p>
          ) : null}
          {presentation === 'dialog' ? (
            activeState.status === 'loading' ? (
              <p className="workspace-settings-page__notice" role="status">
                {appMessage(locale, 'settings.workspace.loading')}
              </p>
            ) : activeState.status === 'error' ? (
              <>
                <div className="workspace-settings-page__notice workspace-settings-page__notice--error">
                  <p role="status">{appMessage(locale, 'settings.workspace.error')}</p>
                  <button onClick={() => void retry()} type="button">
                    {appMessage(locale, 'settings.workspace.retry')}
                  </button>
                </div>
                {topicPanel(true)}
              </>
            ) : (
              <>
                {!activeCanManage ? (
                  <p className="workspace-settings-page__notice" role="status">
                    {appMessage(locale, 'settings.workspace.viewerReadOnly')}
                  </p>
                ) : null}
                {topicPanel(true)}
              </>
            )
          ) : activeState.status === 'loading' ? (
            <p className="workspace-settings-page__notice" role="status">
              {appMessage(locale, 'settings.workspace.loading')}
            </p>
          ) : activeState.status === 'error' ? (
            <>
              <div className="workspace-settings-page__notice workspace-settings-page__notice--error">
                <p role="status">{appMessage(locale, 'settings.workspace.error')}</p>
                <button onClick={() => void retry()} type="button">
                  {appMessage(locale, 'settings.workspace.retry')}
                </button>
              </div>
              {topicPanel(false)}
            </>
          ) : (
            <>
              {!activeCanManage ? (
                <p className="workspace-settings-page__notice" role="status">
                  {appMessage(locale, 'settings.workspace.viewerReadOnly')}
                </p>
              ) : null}
              <div
                className="workspace-settings-page__summary"
                aria-label={
                  locale === 'vi-VN' ? 'Tóm tắt không gian làm việc' : 'Workspace summary'
                }
              >
                <div>
                  <span>{locale === 'vi-VN' ? 'Thành viên' : 'Members'}</span>
                  <strong>{activeProjection?.members.length ?? 0}</strong>
                </div>
                <div>
                  <span>{locale === 'vi-VN' ? 'Phiên đang hoạt động' : 'Active sessions'}</span>
                  <strong>{sessions.length}</strong>
                </div>
                <div>
                  <span>{locale === 'vi-VN' ? 'Chế độ quản lý' : 'Management mode'}</span>
                  <strong>
                    {activeCanManage
                      ? locale === 'vi-VN'
                        ? 'Đầy đủ'
                        : 'Full'
                      : locale === 'vi-VN'
                        ? 'Chỉ xem'
                        : 'View only'}
                  </strong>
                </div>
              </div>
              {topicPanel(false)}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Web-019: bind the owner-only control to IAM's revisioned agent-grant endpoint. */
export function WorkspaceSettingsRoutePage({
  locale,
  demoMode = dashboardDemoMode(),
  presentation = 'page',
}: {
  readonly locale: SupportedLocaleV1;
  readonly demoMode?: boolean;
  readonly presentation?: 'page' | 'dialog';
}) {
  const [demoProjection, setDemoProjection] = useState(DEMO_WORKSPACE_SETTINGS);
  const [demoProfile, setDemoProfile] = useState({
    displayName: 'Mai Quỳnh',
    locale,
    revision: 1,
  });
  const [mutation, setMutation] = useState<{
    readonly status: 'idle' | 'saving' | 'success' | 'error';
    readonly error?: string;
  }>({ status: 'idle' });
  const live = useWorkspaceSettingsResource(!demoMode);
  const projection = live.state.projection;
  const baseUrl =
    typeof import.meta.env['VITE_DATABREEZE_API_BASE_URL'] === 'string'
      ? String(import.meta.env['VITE_DATABREEZE_API_BASE_URL']).replace(/\/$/u, '')
      : '';
  const [liveNotificationPreferences, setLiveNotificationPreferences] =
    useState<NotificationPreferencesSnapshot>();
  const [liveNotificationState, setLiveNotificationState] = useState<
    'loading' | 'ready' | 'error' | 'unavailable'
  >(demoMode ? 'ready' : 'loading');
  const [liveNotificationError, setLiveNotificationError] = useState<string>();
  useEffect(() => {
    if (demoMode) {
      setLiveNotificationState('ready');
      return;
    }
    setLiveNotificationState('loading');
    void fetchNotificationPreferences({ baseUrl })
      .then((snapshot) => {
        setLiveNotificationPreferences(snapshot);
        setLiveNotificationState('ready');
      })
      .catch((error: unknown) => {
        setLiveNotificationError(
          error instanceof Error ? error.message : 'NOTIFICATION_PREFERENCES_UNAVAILABLE',
        );
        setLiveNotificationState(
          error instanceof Error && error.message === 'NOTIFICATION_PREFERENCES_UNAVAILABLE'
            ? 'unavailable'
            : 'error',
        );
      });
  }, [baseUrl, demoMode]);
  if (demoMode) {
    return (
      <WorkspaceSettingsPage
        locale={locale}
        localDelivery
        onProfileSave={(input) => {
          setDemoProfile((current) => ({
            displayName: input.displayName,
            locale: input.locale,
            revision: current.revision + 1,
          }));
          return Promise.resolve();
        }}
        profileDisplayName={demoProfile.displayName}
        profileLocale={demoProfile.locale}
        profileRevision={demoProfile.revision}
        notificationPreferencesState="ready"
        onNotificationPreferencesSave={() => Promise.resolve()}
        onAgentGrantChange={(memberId, level, expectedRevision) => {
          setDemoProjection((current) =>
            Object.freeze({
              ...current,
              members: Object.freeze(
                current.members.map((member) =>
                  member.memberId === memberId && member.agentGrantRevision === expectedRevision
                    ? Object.freeze({
                        ...member,
                        agentGrantLevel: level,
                        agentGrantRevision: member.agentGrantRevision + 1,
                      })
                    : member,
                ),
              ),
            }),
          );
        }}
        onAccessPresetChange={(memberId, preset, expectedRevision) => {
          if (preset === 'OWNER') return;
          setDemoProjection((current) =>
            Object.freeze({
              ...current,
              members: Object.freeze(
                current.members.map((member) =>
                  member.memberId === memberId && member.membershipRevision === expectedRevision
                    ? Object.freeze({
                        ...member,
                        accessPreset: preset,
                        membershipRevision: member.membershipRevision + 1,
                      })
                    : member,
                ),
              ),
            }),
          );
        }}
        onInviteMember={(email, preset) => {
          const id = `00000000-0000-4000-8000-${String(demoProjection.members.length + 404).padStart(12, '0')}`;
          setDemoProjection((current) =>
            Object.freeze({
              ...current,
              members: Object.freeze([
                ...current.members,
                Object.freeze({
                  memberId: id,
                  displayName: email,
                  accessPreset: preset,
                  agentGrantLevel: 'NONE' as const,
                  agentGrantRevision: 1,
                  membershipRevision: 1,
                }),
              ]),
            }),
          );
          return Promise.resolve();
        }}
        projection={demoProjection}
        sessions={demoSessions(locale)}
      />
    );
  }
  const currentSessionId = currentSessionIdV1();
  const liveAuthBootstrap = currentAuthBootstrapV1();
  const [profileOverride, setProfileOverride] = useState<
    | {
        readonly displayName: string;
        readonly locale: SupportedLocaleV1;
        readonly revision: number;
      }
    | undefined
  >();
  const liveProfileDisplayName =
    profileOverride?.displayName ?? liveAuthBootstrap?.user.displayName;
  const liveProfileLocale = profileOverride?.locale ?? liveAuthBootstrap?.user.locale;
  const liveProfileRevision = profileOverride?.revision ?? liveAuthBootstrap?.user.profileRevision;
  const localDelivery =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const liveSessions: readonly SessionRow[] =
    currentSessionId === undefined
      ? []
      : [
          {
            sessionId: currentSessionId,
            deviceLabel:
              locale === 'vi-VN' ? 'Phiên trình duyệt hiện tại' : 'Current browser session',
            current: true,
          },
        ];
  return (
    <WorkspaceSettingsPage
      locale={locale}
      presentation={presentation}
      localDelivery={localDelivery}
      onProfileSave={async (input) => {
        const user = await updateAccountProfile({ baseUrl, ...input });
        setProfileOverride({
          displayName: user.displayName,
          locale: user.locale,
          revision: user.revision,
        });
        const bootstrap = await createAuthApiV1({ baseUrl }).loadBootstrap();
        if (bootstrap.accepted) rememberAuthBootstrapV1(bootstrap.value);
      }}
      {...(liveProfileDisplayName === undefined
        ? {}
        : { profileDisplayName: liveProfileDisplayName })}
      {...(liveProfileLocale === undefined ? {} : { profileLocale: liveProfileLocale })}
      {...(liveProfileRevision === undefined ? {} : { profileRevision: liveProfileRevision })}
      notificationPreferencesState={liveNotificationState}
      {...(liveNotificationError === undefined
        ? {}
        : { notificationPreferencesError: liveNotificationError })}
      {...(liveNotificationPreferences === undefined
        ? {}
        : { notificationPreferences: liveNotificationPreferences })}
      onNotificationPreferencesSave={async (snapshot) => {
        const updated = await updateNotificationPreferences({ baseUrl, snapshot });
        setLiveNotificationPreferences(updated);
      }}
      mutationStatus={mutation.status}
      {...(mutation.error === undefined ? {} : { mutationError: mutation.error })}
      onAgentGrantChange={(memberId, level, expectedRevision) => {
        if (level === undefined || projection?.canManage !== true) return;
        setMutation({ status: 'saving' });
        void setAgentGrant({ baseUrl, memberId, level, expectedRevision })
          .then(async () => {
            await live.retry();
            setMutation({ status: 'success' });
          })
          .catch(async (error: unknown) => {
            await live.retry().catch(() => undefined);
            setMutation({
              status: 'error',
              error:
                error instanceof Error && error.message.includes('REVISION_CONFLICT')
                  ? 'REVISION_CONFLICT'
                  : 'UPDATE_FAILED',
            });
          });
      }}
      onAccessPresetChange={(memberId, preset, expectedRevision) => {
        if (preset === 'OWNER' || projection?.canManage !== true) return;
        setMutation({ status: 'saving' });
        void setAccessPreset({ baseUrl, memberId, accessPreset: preset, expectedRevision })
          .then(async () => {
            await live.retry();
            setMutation({ status: 'success' });
          })
          .catch(async (error: unknown) => {
            await live.retry().catch(() => undefined);
            setMutation({
              status: 'error',
              error:
                error instanceof Error && error.message.includes('REVISION_CONFLICT')
                  ? 'REVISION_CONFLICT'
                  : 'UPDATE_FAILED',
            });
          });
      }}
      onInviteMember={async (email, preset) => {
        await inviteWorkspaceMember({
          baseUrl,
          recipientEmail: email,
          accessPreset: preset,
        });
        await live.retry();
      }}
      onRetry={() => {
        void live.retry();
      }}
      sessions={liveSessions}
      state={live.state}
    />
  );
}
