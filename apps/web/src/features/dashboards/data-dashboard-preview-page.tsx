import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useLocale } from '../../app/locale-context.tsx';
import { dataImportApi } from '../data/data-import-api.ts';
import './data-dashboard-preview-page.css';

export interface DataDashboardPreviewPageProps {
  readonly importId: string;
  /** Render inside the authenticated dashboard shell without a nested page landmark. */
  readonly embedded?: boolean;
}

function formatNumber(value: number, locale: 'vi-VN' | 'en'): string {
  return new Intl.NumberFormat(locale === 'vi-VN' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

export function DataDashboardPreviewPage({
  importId,
  embedded = false,
}: DataDashboardPreviewPageProps) {
  const locale = useLocale();
  const vi = locale === 'vi-VN';
  const query = useQuery({
    queryKey: ['dda', 'data-dashboard-preview', importId],
    queryFn: () => dataImportApi.dashboardPreview(importId),
    retry: false,
  });
  const text = vi
    ? {
        eyebrow: 'Dashboard từ dữ liệu đã duyệt',
        subtitle: 'Bản xem nhanh được tính trực tiếp từ phiên bản bất biến của bạn.',
        loading: 'Đang tính dashboard từ dữ liệu đã duyệt…',
        unavailable: 'Dashboard xem nhanh chưa khả dụng cho phiên bản này.',
        back: 'Quay lại Dữ liệu',
        rows: 'dòng',
        sources: 'nguồn',
        total: 'Tổng',
        average: 'Trung bình',
        minimum: 'Thấp nhất',
        maximum: 'Cao nhất',
        distribution: 'Phân bổ theo',
        sample: 'Mẫu dữ liệu đã duyệt',
        freshness: 'Bản xem nhanh · không phải snapshot chứng nhận',
        noMeasure: 'Không tìm thấy cột số để tính KPI.',
      }
    : {
        eyebrow: 'Dashboard from approved data',
        subtitle: 'A bounded preview calculated directly from your immutable approved version.',
        loading: 'Calculating your dashboard from approved data…',
        unavailable: 'A dashboard preview is not available for this version yet.',
        back: 'Back to Data',
        rows: 'rows',
        sources: 'sources',
        total: 'Total',
        average: 'Average',
        minimum: 'Minimum',
        maximum: 'Maximum',
        distribution: 'Distribution by',
        sample: 'Approved data sample',
        freshness: 'Preview · not a certified snapshot',
        noMeasure: 'No numeric column was found for KPI calculations.',
      };

  if (query.isPending) {
    const Root = embedded ? 'section' : 'main';
    return (
      <Root
        className={`data-preview-page${embedded ? ' data-preview-page--embedded' : ''}`}
        aria-busy="true"
        aria-label={embedded ? text.eyebrow : undefined}
      >
        <div className="data-preview-loading">{text.loading}</div>
      </Root>
    );
  }
  if (query.error || query.data === undefined) {
    const Root = embedded ? 'section' : 'main';
    return (
      <Root
        className={`data-preview-page${embedded ? ' data-preview-page--embedded' : ''}`}
        aria-label={embedded ? text.eyebrow : undefined}
      >
        <section className="data-preview-empty" role="status">
          <span className="data-preview-empty__icon">↗</span>
          <h1>{text.unavailable}</h1>
          <p>{query.error instanceof Error ? query.error.message : text.unavailable}</p>
          <Link to={`/${locale}/data`} className="db-button db-button--primary">
            {text.back}
          </Link>
        </section>
      </Root>
    );
  }

  const preview = query.data;
  const measure = preview.measure;
  const maxGroup = Math.max(...(preview.dimension?.groups.map((group) => group.count) ?? [1]));
  const columnNames = preview.columns.slice(0, 6).map((column) => column.name);
  const samples = preview.sampleRows.map(
    (row) => new Map(row.cells.map((cell) => [cell.field, cell])),
  );

  const Root = embedded ? 'section' : 'main';
  return (
    <Root
      className={`data-preview-page${embedded ? ' data-preview-page--embedded' : ''}`}
      aria-label={embedded ? text.eyebrow : undefined}
    >
      <header className="data-preview-hero">
        <div>
          <p className="data-preview-eyebrow">
            <span className="data-preview-eyebrow__dot" />
            {text.eyebrow}
          </p>
          <h1>{preview.datasetName}</h1>
          <p className="data-preview-subtitle">{text.subtitle}</p>
        </div>
        <div className="data-preview-meta">
          <span>
            {formatNumber(preview.rowCount, locale)} {text.rows}
          </span>
          <span>
            {preview.sourceCount} {text.sources}
          </span>
          <span className="data-preview-meta__fresh">{text.freshness}</span>
        </div>
      </header>

      {measure === undefined ? (
        <div className="data-preview-note">{text.noMeasure}</div>
      ) : (
        <section className="data-preview-kpis" aria-label={text.eyebrow}>
          {[
            [text.total, measure.sum],
            [text.average, measure.average],
            [text.minimum, measure.minimum],
            [text.maximum, measure.maximum],
          ].map(([label, value], index) => (
            <article
              className={`data-preview-kpi data-preview-kpi--${index + 1}`}
              key={String(label)}
            >
              <span>{label}</span>
              <strong>{formatNumber(Number(value), locale)}</strong>
              <small>{measure.field}</small>
            </article>
          ))}
        </section>
      )}

      {preview.dimension !== undefined ? (
        <section className="data-preview-panel" aria-labelledby="data-preview-distribution">
          <div className="data-preview-panel__heading">
            <div>
              <span className="data-preview-panel__kicker">{text.distribution}</span>
              <h2 id="data-preview-distribution">{preview.dimension.field}</h2>
            </div>
            <span className="data-preview-panel__badge">
              {preview.dimension.groups.length} groups
            </span>
          </div>
          <div className="data-preview-bars">
            {preview.dimension.groups.map((group) => (
              <div className="data-preview-bar-row" key={group.label}>
                <div className="data-preview-bar-label">
                  <span>{group.label}</span>
                  <b>{group.count}</b>
                </div>
                <div className="data-preview-bar-track">
                  <span style={{ width: `${Math.max(8, (group.count / maxGroup) * 100)}%` }} />
                </div>
                {group.total === undefined ? null : (
                  <small>{formatNumber(group.total, locale)}</small>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section
        className="data-preview-panel data-preview-panel--table"
        aria-labelledby="data-preview-sample"
      >
        <div className="data-preview-panel__heading">
          <div>
            <span className="data-preview-panel__kicker">{text.sample}</span>
            <h2 id="data-preview-sample">
              {preview.rowCount} {text.rows}
            </h2>
          </div>
        </div>
        <div className="data-preview-table-wrap">
          <table className="data-preview-table">
            <thead>
              <tr>
                {columnNames.map((name) => (
                  <th key={name}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {samples.map((row, index) => (
                <tr key={index}>
                  {columnNames.map((name) => {
                    const cell = row.get(name);
                    return (
                      <td key={name}>{cell?.kind === 'EMPTY' ? '—' : (cell?.value ?? '—')}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Root>
  );
}
