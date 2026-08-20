import {
  AGENT_GRANT_LEVELS_V1,
  isAgentGrantLevelV1,
  isMembershipAccessPresetV1,
  type AgentGrantLevelV1,
  type MembershipAccessPresetV1,
} from '@databreeze/domain/permissions/v1';

export type MemberAccessRow = {
  readonly memberId: string;
  readonly displayName: string;
  readonly preset: MembershipAccessPresetV1 | 'Owner' | 'Editor' | 'Viewer';
  readonly agentGrant?: AgentGrantLevelV1;
  readonly agentGrantRevision?: number;
  readonly membershipRevision?: number;
};

export type MemberAccessTableProperties = {
  readonly locale: 'vi-VN' | 'en';
  readonly rows: readonly MemberAccessRow[];
  readonly canManage?: boolean;
  readonly onAgentGrantChange?: (
    memberId: string,
    level: AgentGrantLevelV1,
    expectedRevision: number,
  ) => void;
  readonly onAccessPresetChange?: (
    memberId: string,
    preset: MembershipAccessPresetV1,
    expectedRevision: number,
  ) => void;
};

const PRESET_LABELS = {
  'vi-VN': {
    OWNER: 'Chủ sở hữu',
    EDITOR: 'Biên tập viên',
    VIEWER: 'Người xem',
  },
  en: {
    OWNER: 'Owner',
    EDITOR: 'Editor',
    VIEWER: 'Viewer',
  },
} as const;

const AGENT_GRANT_LABELS: Readonly<
  Record<'vi-VN' | 'en', Readonly<Record<AgentGrantLevelV1, string>>>
> = {
  'vi-VN': {
    NONE: 'Không có quyền trợ lý',
    ANALYZE: 'Phân tích',
    PROPOSE_CHANGES: 'Đề xuất thay đổi',
    APPLY_CONFIRMED_CHANGES: 'Áp dụng thay đổi đã xác nhận',
  },
  en: {
    NONE: 'No agent access',
    ANALYZE: 'Analyze',
    PROPOSE_CHANGES: 'Propose changes',
    APPLY_CONFIRMED_CHANGES: 'Apply confirmed changes',
  },
};

function canonicalPreset(preset: MemberAccessRow['preset']): MembershipAccessPresetV1 {
  if (preset === 'Owner') return 'OWNER';
  if (preset === 'Editor') return 'EDITOR';
  if (preset === 'Viewer') return 'VIEWER';
  return preset;
}

export function MemberAccessTable({
  locale,
  rows,
  canManage = false,
  onAgentGrantChange,
  onAccessPresetChange,
}: MemberAccessTableProperties) {
  const label = locale === 'vi-VN' ? 'Bảng quyền thành viên' : 'Member access table';
  return (
    <table aria-label={label} className="member-access-table">
      <thead>
        <tr>
          <th>{locale === 'vi-VN' ? 'Thành viên' : 'Member'}</th>
          <th>{locale === 'vi-VN' ? 'Quyền truy cập' : 'Access preset'}</th>
          <th>{locale === 'vi-VN' ? 'Trợ lý' : 'Agent'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const preset = canonicalPreset(row.preset);
          const agentControlLabel =
            locale === 'vi-VN'
              ? `Quyền trợ lý của ${row.displayName}`
              : `Agent access for ${row.displayName}`;
          return (
            <tr key={row.memberId}>
              <td>
                <span className="member-access-table__avatar" aria-hidden="true">
                  {row.displayName.trim().slice(0, 1).toLocaleUpperCase(locale)}
                </span>
                <strong>{row.displayName}</strong>
              </td>
              <td>
                {canManage && onAccessPresetChange && preset !== 'OWNER' ? (
                  <>
                    <label className="sr-only" htmlFor={`member-preset-${row.memberId}`}>
                      {locale === 'vi-VN'
                        ? `Quyền truy cập của ${row.displayName}`
                        : `Access preset for ${row.displayName}`}
                    </label>
                    <select
                      aria-label={
                        locale === 'vi-VN'
                          ? `Quyền truy cập của ${row.displayName}`
                          : `Access preset for ${row.displayName}`
                      }
                      id={`member-preset-${row.memberId}`}
                      onChange={(event) => {
                        if (!isMembershipAccessPresetV1(event.target.value)) return;
                        onAccessPresetChange(
                          row.memberId,
                          event.target.value,
                          row.membershipRevision && row.membershipRevision > 0
                            ? row.membershipRevision
                            : 1,
                        );
                      }}
                      value={preset}
                    >
                      {(['EDITOR', 'VIEWER'] as const).map((option) => (
                        <option key={option} value={option}>
                          {PRESET_LABELS[locale][option]}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="member-access-table__preset">
                    {PRESET_LABELS[locale][preset]}
                  </span>
                )}
              </td>
              <td>
                {AGENT_GRANT_LABELS[locale][row.agentGrant ?? 'NONE']}
                {canManage && onAgentGrantChange ? (
                  <>
                    <label className="sr-only" htmlFor={`agent-grant-${row.memberId}`}>
                      {agentControlLabel}
                    </label>
                    <select
                      aria-label={agentControlLabel}
                      id={`agent-grant-${row.memberId}`}
                      onChange={(event) => {
                        if (!isAgentGrantLevelV1(event.target.value)) return;
                        onAgentGrantChange(
                          row.memberId,
                          event.target.value,
                          row.agentGrantRevision && row.agentGrantRevision > 0
                            ? row.agentGrantRevision
                            : 1,
                        );
                      }}
                      value={row.agentGrant ?? 'NONE'}
                    >
                      {AGENT_GRANT_LEVELS_V1.filter(
                        (level) => preset !== 'VIEWER' || level === 'NONE' || level === 'ANALYZE',
                      ).map((level) => (
                        <option key={level} value={level}>
                          {AGENT_GRANT_LABELS[locale][level]}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
