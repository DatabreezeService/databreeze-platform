import type { SourceReviewRecordV1 } from '../../shared/source-review-contract-v1.ts';

export interface SourceSampleTableProps {
  readonly locale?: 'vi' | 'en';
  readonly rows: readonly Readonly<Record<string, string>>[];
}

/** DSK-010: bounded sample table for source review. */
export function SourceSampleTable({ locale = 'vi', rows }: SourceSampleTableProps) {
  const title = locale === 'en' ? 'Sample rows' : 'Hang mau';
  if (rows.length === 0) {
    return <p>{locale === 'en' ? 'No sample rows' : 'Khong co hang mau'}</p>;
  }
  const columns = Object.keys(rows[0] ?? {});
  return (
    <table aria-label={title}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`row-${index}`}>
            {columns.map((column) => (
              <td key={`${index}-${column}`}>{row[column] ?? ''}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface SourceReviewScreenProps {
  readonly locale?: 'vi' | 'en';
  readonly record: SourceReviewRecordV1;
  readonly onAction?: (action: SourceReviewRecordV1['actions'][number]) => void;
}

/** DSK-010: rich misplaced/ambiguous source review surface. */
export function SourceReviewScreen({
  locale = 'vi',
  record,
  onAction,
}: SourceReviewScreenProps) {
  const title = locale === 'en' ? 'Source review' : 'Xem xét nguồn';
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      <p>
        {locale === 'en' ? 'File' : 'Tệp'}: {record.fileLabel}
      </p>
      <p>
        {locale === 'en' ? 'Current' : 'Hiện tại'}: {record.currentFolder} →{' '}
        {locale === 'en' ? 'Suggested' : 'Đề xuất'}: {record.suggestedFolder}
      </p>
      <p>
        {locale === 'en' ? 'Dataset' : 'Tập dữ liệu'}: {record.logicalDatasetLabel} · confidence=
        {record.confidence}
      </p>
      <ul aria-label={locale === 'en' ? 'Reasons' : 'Lý do'}>
        {record.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <ul aria-label={locale === 'en' ? 'Warnings' : 'Cảnh báo'}>
        {record.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <p>
        schema current={record.schemaComparison.current.join(', ')} expected=
        {record.schemaComparison.expected.join(', ')}
      </p>
      <SourceSampleTable locale={locale} rows={record.sampleRows} />
      <div role="group" aria-label={locale === 'en' ? 'Actions' : 'Hành động'}>
        {record.actions.map((action) => (
          <button key={action} type="button" onClick={() => onAction?.(action)}>
            {action}
          </button>
        ))}
      </div>
    </section>
  );
}
