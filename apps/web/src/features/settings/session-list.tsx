export type SessionRow = {
  readonly sessionId: string;
  readonly deviceLabel: string;
  readonly current: boolean;
};

export type SessionListProperties = {
  readonly locale: 'vi-VN' | 'en';
  readonly sessions: readonly SessionRow[];
  readonly onRevoke?: (sessionId: string) => void;
};

export function SessionList({ locale, sessions, onRevoke }: SessionListProperties) {
  const label = locale === 'vi-VN' ? 'Danh sách phiên đăng nhập' : 'Session list';
  return (
    <ul aria-label={label} className="workspace-session-list">
      {sessions.map((session) => (
        <li key={session.sessionId}>
          <span className="workspace-session-list__device" aria-hidden="true" />
          <span>
            <strong>{session.deviceLabel}</strong>
            <small>
              {session.current
                ? locale === 'vi-VN'
                  ? 'Đang hoạt động · Được bảo vệ'
                  : 'Active now · Protected'
                : locale === 'vi-VN'
                  ? 'Phiên khác'
                  : 'Other session'}
            </small>
          </span>
          {session.current || onRevoke === undefined ? null : (
            <button onClick={() => onRevoke(session.sessionId)} type="button">
              {locale === 'vi-VN' ? 'Thu hồi phiên' : 'Revoke session'}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
