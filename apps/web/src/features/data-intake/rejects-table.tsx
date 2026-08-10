export interface RejectRowV1 {
  readonly scope: string;
  readonly reasonCode: string;
  readonly count: number;
}

export interface RejectsTableProps {
  readonly rejects: readonly RejectRowV1[];
  readonly locale?: 'vi' | 'en';
}

/** DDA-008 leaf: reason-coded rejects/exclusions. */
export function RejectsTable({ rejects, locale = 'vi' }: RejectsTableProps) {
  const title = locale === 'en' ? 'Rejected and excluded scopes' : 'Pham vi bi loai/tu choi';
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>{locale === 'en' ? 'Scope' : 'Pham vi'}</th>
            <th>{locale === 'en' ? 'Reason' : 'Ly do'}</th>
            <th>{locale === 'en' ? 'Count' : 'So luong'}</th>
          </tr>
        </thead>
        <tbody>
          {rejects.map((row) => (
            <tr key={`${row.scope}-${row.reasonCode}`}>
              <td>{row.scope}</td>
              <td>{row.reasonCode}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
