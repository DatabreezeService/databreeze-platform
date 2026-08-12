export type MemberAccessRow = {
  readonly memberId: string;
  readonly displayName: string;
  readonly preset: 'Owner' | 'Editor' | 'Viewer';
  readonly agentGrant: 'NONE' | 'USE' | 'MANAGE';
};

export type MemberAccessTableProperties = {
  readonly locale: 'vi-VN' | 'en';
  readonly rows: readonly MemberAccessRow[];
};

export function MemberAccessTable({ locale, rows }: MemberAccessTableProperties) {
  const label = locale === 'vi-VN' ? 'Bảng quyền thành viên' : 'Member access table';
  return (
    <table aria-label={label}>
      <thead>
        <tr>
          <th>{locale === 'vi-VN' ? 'Thành viên' : 'Member'}</th>
          <th>{locale === 'vi-VN' ? 'Preset' : 'Preset'}</th>
          <th>{locale === 'vi-VN' ? 'Tác nhân' : 'Agent'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.memberId}>
            <td>{row.displayName}</td>
            <td>{row.preset}</td>
            <td>{row.agentGrant}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
