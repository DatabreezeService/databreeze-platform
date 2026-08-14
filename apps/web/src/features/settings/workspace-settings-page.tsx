import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import { appMessage } from '../../app/messages.ts';
import {
  setAgentGrant,
  useWorkspaceSettingsResource,
  type WorkspaceMemberProjection,
  type WorkspaceSettingsProjection,
  type WorkspaceSettingsState,
} from './settings-api.ts';
import { MemberAccessTable, type MemberAccessRow } from './member-access-table.tsx';
import { SessionList } from './session-list.tsx';

export interface WorkspaceSettingsPageProperties {
  readonly locale: SupportedLocaleV1;
  /** Controlled compatibility input for focused presentation tests and embedded settings shells. */
  readonly canManage?: boolean;
  readonly projection?: WorkspaceSettingsProjection;
  readonly state?: WorkspaceSettingsState;
  readonly onRetry?: () => void;
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
      <h1>{appMessage(locale, 'settings.workspace.title')}</h1>
      {activeState.status === 'loading' ? (
        <p role="status">{appMessage(locale, 'settings.workspace.loading')}</p>
      ) : activeState.status === 'error' ? (
        <p role="status">
          {appMessage(locale, 'settings.workspace.error')}
          <button onClick={() => void retry()} type="button">
            {appMessage(locale, 'settings.workspace.retry')}
          </button>
        </p>
      ) : (
        <>
          {!activeCanManage ? (
            <p role="status">{appMessage(locale, 'settings.workspace.viewerReadOnly')}</p>
          ) : null}
          <h2>{appMessage(locale, 'settings.workspace.members')}</h2>
          <MemberAccessTable
            canManage={activeCanManage}
            locale={locale}
            rows={rowsFromProjection(activeProjection)}
            {...(onAgentGrantChange === undefined ? {} : { onAgentGrantChange })}
          />
          <h2>{appMessage(locale, 'settings.workspace.sessions')}</h2>
          <SessionList locale={locale} onRevoke={() => undefined} sessions={[]} />
        </>
      )}
    </section>
  );
}

/** Web-019: bind the owner-only control to IAM's revisioned agent-grant endpoint. */
export function WorkspaceSettingsRoutePage({ locale }: { readonly locale: SupportedLocaleV1 }) {
  const live = useWorkspaceSettingsResource(true);
  const projection = live.state.projection;
  const baseUrl =
    typeof import.meta.env['VITE_DATABREEZE_API_BASE_URL'] === 'string'
      ? String(import.meta.env['VITE_DATABREEZE_API_BASE_URL']).replace(/\/$/u, '')
      : '';
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
