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
      {sessions.length === 0 ? (
        <li className="workspace-session-list__empty">
          <span className="workspace-session-list__device" aria-hidden="true" />
          <span>
            <strong>{locale === 'vi-VN' ? 'Chưa có dữ liệu phiên' : 'No session data yet'}</strong>
            <small>
              {locale === 'vi-VN'
                ? 'Máy chủ chưa cung cấp danh sách phiên. Hãy tải lại sau khi phiên được xác thực.'
                : 'The server has not provided a session list yet. Reload after the session is verified.'}
            </small>
          </span>
        </li>
      ) : (
        sessions.map((session) => (
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
        ))
      )}
    </ul>
  );
}
