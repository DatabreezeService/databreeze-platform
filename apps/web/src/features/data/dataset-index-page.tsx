import { normalizedDatasetHealth, type DatasetCardV1 } from './data-model.ts';

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
  readonly selectedDatasetId?: string;
}

/** DDA-052: default catalog is logical datasets, never one-file-as-a-dataset. */
export function DatasetIndexPage({
  datasets,
  heading = true,
  locale,
  onSelectDataset,
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
          <p className="dataset-index-page__empty">
            {locale === 'vi-VN'
              ? 'Tải tệp an toàn chưa khả dụng trong bản chạy này.'
              : 'Secure file upload is not yet available in this build.'}
          </p>
        </>
      ) : (
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
      )}
    </section>
  );
}
