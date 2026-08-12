export type WorkspaceSettingsPageProperties = {
  readonly locale: 'vi-VN' | 'en';
  readonly canManage: boolean;
};

const COPY = {
  'vi-VN': {
    title: 'Cài đặt không gian làm việc',
    denied: 'Viewer không thể thay đổi cài đặt',
    members: 'Thành viên',
    sessions: 'Phiên đang hoạt động',
  },
  en: {
    title: 'Workspace settings',
    denied: 'Viewer cannot change settings',
    members: 'Members',
    sessions: 'Active sessions',
  },
} as const;

export function WorkspaceSettingsPage({ locale, canManage }: WorkspaceSettingsPageProperties) {
  const copy = COPY[locale];
  return (
    <section aria-label={copy.title} className="workspace-settings-page">
      <h1>{copy.title}</h1>
      {canManage ? (
        <>
          <h2>{copy.members}</h2>
          <h2>{copy.sessions}</h2>
        </>
      ) : (
        <p role="status">{copy.denied}</p>
      )}
    </section>
  );
}
