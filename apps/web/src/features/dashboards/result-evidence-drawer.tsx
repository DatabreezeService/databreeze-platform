import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export interface ResultEvidenceCellV1 {
  readonly cellId: string;
  readonly field: string;
  readonly value: number;
  readonly unit: string;
  readonly planVersionId: string;
  readonly metricVersionId: string;
}

export interface ResultEvidenceDrawerProps {
  readonly locale: SupportedLocaleV1;
  readonly cells: readonly ResultEvidenceCellV1[];
  readonly open: boolean;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-019: evidence drawer linking claims to deterministic result cells. */
export function ResultEvidenceDrawer({ locale, cells, open }: ResultEvidenceDrawerProps) {
  if (!open) return null;
  return (
    <aside aria-label={label(locale, 'Bằng chứng kết quả', 'Result evidence')}>
      <h2>{label(locale, 'Bằng chứng số liệu', 'Numeric evidence')}</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">{label(locale, 'Ô', 'Cell')}</th>
            <th scope="col">{label(locale, 'Trường', 'Field')}</th>
            <th scope="col">{label(locale, 'Giá trị', 'Value')}</th>
            <th scope="col">{label(locale, 'Đơn vị', 'Unit')}</th>
            <th scope="col">{label(locale, 'Kế hoạch', 'Plan')}</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((cell) => (
            <tr key={cell.cellId}>
              <td>{cell.cellId}</td>
              <td>{cell.field}</td>
              <td>{cell.value}</td>
              <td>{cell.unit}</td>
              <td>{cell.planVersionId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}
