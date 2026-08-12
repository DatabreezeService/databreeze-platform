export type SessionRow = {
  readonly sessionId: string;
  readonly deviceLabel: string;
  readonly current: boolean;
};

export type SessionListProperties = {
  readonly locale: 'vi-VN' | 'en';
  readonly sessions: readonly SessionRow[];
  readonly onRevoke: (sessionId: string) => void;
};

export function SessionList({ locale, sessions, onRevoke }: SessionListProperties) {
  const label = locale === 'vi-VN' ? 'Danh sách phiên' : 'Session list';
  return (
    <ul aria-label={label}>
      {sessions.map((session) => (
        <li key={session.sessionId}>
          <span>{session.deviceLabel}</span>
          {session.current ? null : (
            <button onClick={() => onRevoke(session.sessionId)} type="button">
              {locale === 'vi-VN' ? 'Thu hồi' : 'Revoke'}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
