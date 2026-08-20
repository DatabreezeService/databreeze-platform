import { normalizedDatasetHealth, type DatasetCardV1 } from './data-model.ts';
import { SourceUploadPanel } from './source-upload-panel.tsx';
import { Link } from 'react-router-dom';

export type { DatasetCardV1 } from './data-model.ts';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        empty: 'Chưa có bộ dữ liệu được cấp quyền trong không gian làm việc này.',
        heading: 'Dữ liệu',
        open: 'Mở bộ dữ liệu',
      }
    : {
        empty: 'No authorized datasets are available in this workspace.',
        heading: 'Data',
        open: 'Open dataset',
      };
}

export interface DatasetIndexPageProps {
  readonly datasets: readonly DatasetCardV1[];
  readonly heading?: boolean;
  readonly locale: 'en' | 'vi-VN';
  readonly onSelectDataset?: (datasetId: string) => void;
  readonly onSelectFiles?: (files: FileList) => void;
  readonly selectedDatasetId?: string;
}

/** DDA-052: default catalog is logical datasets, never one-file-as-a-dataset. */
export function DatasetIndexPage({
  datasets,
  heading = true,
  locale,
  onSelectDataset,
  onSelectFiles,
  selectedDatasetId,
}: DatasetIndexPageProps) {
  const text = copy(locale);
  return (
    <section aria-label={text.heading} className="dataset-index-page">
      {heading ? <h1>{text.heading}</h1> : null}
      {datasets.length === 0 ? (
        <>
          <p className="dataset-index-page__empty" role="status">
            {text.empty}
          </p>
          {onSelectFiles === undefined ? (
            <div className="dataset-index-page__empty-action">
              <p className="dataset-index-page__empty">
                {locale === 'vi-VN'
                  ? 'Mở không gian Dữ liệu để tải CSV hoặc XLSX và bắt đầu bản xem xét có thể tải lại.'
                  : 'Open the Data workspace to upload CSV or XLSX and start a reloadable review.'}
              </p>
              <Link className="db-button db-button--primary" to={`/${locale}/data`}>
                {locale === 'vi-VN' ? 'Mở Dữ liệu' : 'Open Data'}
              </Link>
            </div>
          ) : (
            <SourceUploadPanel locale={locale} onSelectFiles={onSelectFiles} />
          )}
        </>
      ) : (
        <>
          <ul className="dataset-index-page__list">
            {datasets.map((dataset) => {
              const health = normalizedDatasetHealth(dataset.health, locale);
              const selected = dataset.datasetId === selectedDatasetId;
              return (
                <li key={dataset.datasetId}>
                  <button
                    aria-current={selected ? 'page' : undefined}
                    aria-label={`${text.open}: ${dataset.label}`}
                    className={`dataset-index-page__card${selected ? ' is-selected' : ''}`}
                    onClick={() => onSelectDataset?.(dataset.datasetId)}
                    type="button"
                  >
                    <span className="dataset-index-page__card-main">
                      <strong>{dataset.label}</strong>
                      <span>{dataset.versionLabel}</span>
                    </span>
                    <span className={`dataset-index-page__health is-${health.tone.toLowerCase()}`}>
                      {health.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {onSelectFiles === undefined ? null : (
            <SourceUploadPanel locale={locale} onSelectFiles={onSelectFiles} />
          )}
        </>
      )}
    </section>
  );
}
