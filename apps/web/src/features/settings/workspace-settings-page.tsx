import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import { useState } from 'react';
import { appMessage } from '../../app/messages.ts';
import { dashboardDemoMode } from '../dashboards/dashboard-api.ts';
import {
  setAgentGrant,
  useWorkspaceSettingsResource,
  type WorkspaceMemberProjection,
  type WorkspaceSettingsProjection,
  type WorkspaceSettingsState,
} from './settings-api.ts';
import { MemberAccessTable, type MemberAccessRow } from './member-access-table.tsx';
import { SessionList, type SessionRow } from './session-list.tsx';
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
  /** Controlled compatibility input for focused presentation tests and embedded settings shells. */
  readonly canManage?: boolean;
  readonly projection?: WorkspaceSettingsProjection;
  readonly state?: WorkspaceSettingsState;
  readonly onRetry?: () => void;
  readonly sessions?: readonly SessionRow[];
  readonly onAgentGrantChange?: (
    memberId: string,
    level: NonNullable<MemberAccessRow['agentGrant']>,
    expectedRevision: number,
  ) => void;
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
    })) ?? []
  );
}

export function WorkspaceSettingsPage({
  locale,
  canManage,
  projection,
  state,
  onRetry,
  sessions = [],
  onAgentGrantChange,
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

  return (
    <section
      aria-label={appMessage(locale, 'settings.workspace.title')}
      className="workspace-settings-page"
    >
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
      </header>
      {activeState.status === 'loading' ? (
        <p className="workspace-settings-page__notice" role="status">
          {appMessage(locale, 'settings.workspace.loading')}
        </p>
      ) : activeState.status === 'error' ? (
        <div className="workspace-settings-page__notice workspace-settings-page__notice--error">
          <p role="status">{appMessage(locale, 'settings.workspace.error')}</p>
          <button onClick={() => void retry()} type="button">
            {appMessage(locale, 'settings.workspace.retry')}
          </button>
        </div>
      ) : (
        <>
          {!activeCanManage ? (
            <p className="workspace-settings-page__notice" role="status">
              {appMessage(locale, 'settings.workspace.viewerReadOnly')}
            </p>
          ) : null}
          <div
            className="workspace-settings-page__summary"
            aria-label={locale === 'vi-VN' ? 'Tóm tắt không gian làm việc' : 'Workspace summary'}
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
              />
            </div>
          </section>
          <section className="workspace-settings-page__section">
            <div className="workspace-settings-page__section-heading">
              <div>
                <p>{locale === 'vi-VN' ? 'Bảo mật' : 'Security'}</p>
                <h2>{appMessage(locale, 'settings.workspace.sessions')}</h2>
              </div>
            </div>
            <SessionList locale={locale} sessions={sessions} />
          </section>
        </>
      )}
    </section>
  );
}

/** Web-019: bind the owner-only control to IAM's revisioned agent-grant endpoint. */
export function WorkspaceSettingsRoutePage({
  locale,
  demoMode = dashboardDemoMode(),
}: {
  readonly locale: SupportedLocaleV1;
  readonly demoMode?: boolean;
}) {
  const [demoProjection, setDemoProjection] = useState(DEMO_WORKSPACE_SETTINGS);
  const live = useWorkspaceSettingsResource(!demoMode);
  const projection = live.state.projection;
  const baseUrl =
    typeof import.meta.env['VITE_DATABREEZE_API_BASE_URL'] === 'string'
      ? String(import.meta.env['VITE_DATABREEZE_API_BASE_URL']).replace(/\/$/u, '')
      : '';
  if (demoMode) {
    return (
      <WorkspaceSettingsPage
        locale={locale}
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
        projection={demoProjection}
        sessions={demoSessions(locale)}
      />
    );
  }
  return (
    <WorkspaceSettingsPage
      locale={locale}
      onAgentGrantChange={(memberId, level, expectedRevision) => {
        if (level === undefined || projection?.canManage !== true) return;
        void setAgentGrant({ baseUrl, memberId, level, expectedRevision })
          .then(() => live.retry())
          .catch(() => live.retry());
      }}
      onRetry={() => {
        void live.retry();
      }}
      state={live.state}
    />
  );
}
