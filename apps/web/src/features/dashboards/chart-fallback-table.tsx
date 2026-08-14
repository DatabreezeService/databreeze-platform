import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export interface ChartFallbackTableRowV1 {
  readonly rowId: string;
  readonly label: string;
  readonly displayValue: string;
  readonly unit?: string;
}

export interface ChartFallbackTableProps {
  readonly locale: SupportedLocaleV1;
  readonly rows: readonly ChartFallbackTableRowV1[];
  readonly emptyMessage?: string;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

function visibleUnit(rows: readonly ChartFallbackTableRowV1[]): string | undefined {
  const units = [
    ...new Set(rows.map((row) => row.unit).filter((unit): unit is string => unit !== undefined)),
  ];
  return units.length === 1 ? units[0] : undefined;
}

/** DDA-018/DDA-021/DDA-026: the same permission-filtered result rows remain readable without charts. */
export function ChartFallbackTable({ locale, rows, emptyMessage }: ChartFallbackTableProps) {
  const unit = visibleUnit(rows);
  const title = label(locale, 'Bảng dự phòng biểu đồ', 'Chart fallback table');
  const tableName = unit === undefined ? title : title + ' (' + unit + ')';

  return (
    <table className="dda-chart-fallback-table" aria-label={tableName}>
      <thead>
        <tr>
          <th scope="col">{label(locale, 'Nhãn', 'Label')}</th>
          <th scope="col">
            {unit === undefined
              ? label(locale, 'Giá trị', 'Value')
              : label(locale, 'Giá trị', 'Value') + ' (' + unit + ')'}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length > 0 ? (
          rows.map((row) => (
            <tr key={row.rowId}>
              <td>{row.label}</td>
              <td>{row.displayValue}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={2}>
              {emptyMessage ??
                label(locale, 'Không có hàng được phép hiển thị.', 'No permitted rows to display.')}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
