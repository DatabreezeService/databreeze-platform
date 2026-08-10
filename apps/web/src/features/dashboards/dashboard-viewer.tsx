import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export interface DashboardViewerProps {
  readonly locale: SupportedLocaleV1;
  readonly rows: readonly Record<string, string>[];
  readonly denied?: boolean;
  readonly permissionExpansionDenied: true;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-026: permission-filtered viewer without exposing hidden field names. */
export function DashboardViewer({
  locale,
  rows,
  denied = false,
  permissionExpansionDenied,
}: DashboardViewerProps) {
  void permissionExpansionDenied;
  if (denied) {
    return (
      <section aria-label={label(locale, 'Xem bảng điều khiển', 'Dashboard viewer')}>
        <p role="alert">{label(locale, 'Không được phép xem', 'View denied')}</p>
      </section>
    );
  }
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <section aria-label={label(locale, 'Xem bảng điều khiển', 'Dashboard viewer')}>
      <p role="status">
        {label(
          locale,
          'Chia sẻ không mở rộng quyền nguồn.',
          'Sharing does not expand source permissions.',
        )}
      </p>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`row-${index}`}>
              {columns.map((column) => (
                <td key={column}>{row[column]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
