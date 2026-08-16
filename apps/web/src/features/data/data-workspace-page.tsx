import { useEffect, useMemo, useState } from 'react';

import { DatasetDetailPage } from './dataset-detail-page.tsx';
import { DatasetIndexPage } from './dataset-index-page.tsx';
import type { DatasetCardV1, DatasetReviewItemV1, DatasetSourceFileV1 } from './data-model.ts';
import './data-workspace.css';

type DataWorkspaceView = 'datasets' | 'sources' | 'review';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        datasets: 'Bộ dữ liệu',
        description:
          'Quản lý bộ dữ liệu, tệp nguồn, phiên bản và các mục cần xem xét trong phạm vi được cấp quyền.',
        heading: 'Dữ liệu',
        review: 'Cần xem xét',
        sources: 'Tệp nguồn',
      }
    : {
        datasets: 'Datasets',
        description:
          'Manage datasets, source files, versions, and review items within your authorized scope.',
        heading: 'Data',
        review: 'Needs review',
        sources: 'Source files',
      };
}

interface SourceWithDatasetV1 {
  readonly datasetLabel: string;
  readonly source: DatasetSourceFileV1;
}

interface ReviewWithDatasetV1 {
  readonly datasetLabel: string;
  readonly review: DatasetReviewItemV1;
}

export interface DataWorkspacePageProps {
  readonly datasets: readonly DatasetCardV1[];
  readonly locale: 'en' | 'vi-VN';
  readonly onConnectSource?: () => void;
  readonly onOpenOriginal?: (sourceId: string) => void;
  readonly onSelectFiles?: (files: FileList) => void;
  readonly onViewEvidence?: (sourceId: string) => void;
}

/** WEB-024/DDA-052: Data starts at logical datasets and shows safe detail only after selection. */
export function DataWorkspacePage({
  datasets,
  locale,
  onConnectSource,
  onOpenOriginal,
  onSelectFiles,
  onViewEvidence,
}: DataWorkspacePageProps) {
  const [activeView, setActiveView] = useState<DataWorkspaceView>('datasets');
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | undefined>();
  const [selectedSourceId, setSelectedSourceId] = useState<string | undefined>();
  const text = copy(locale);
  const selectedDataset = datasets.find((dataset) => dataset.datasetId === selectedDatasetId);
  const sources = useMemo<readonly SourceWithDatasetV1[]>(
    () =>
      datasets.flatMap((dataset) =>
        (dataset.sources ?? []).map((source) => ({ datasetLabel: dataset.label, source })),
      ),
    [datasets],
  );
  const reviewItems = useMemo<readonly ReviewWithDatasetV1[]>(
    () =>
      datasets.flatMap((dataset) =>
        (dataset.reviewItems ?? []).map((review) => ({ datasetLabel: dataset.label, review })),
      ),
    [datasets],
  );

  useEffect(() => {
    if (
      selectedDatasetId !== undefined &&
      datasets.some((dataset) => dataset.datasetId === selectedDatasetId)
    )
      return;
    setSelectedDatasetId(datasets[0]?.datasetId);
    setSelectedSourceId(undefined);
  }, [datasets, selectedDatasetId]);

  function selectDataset(datasetId: string) {
    setSelectedDatasetId(datasetId);
    setSelectedSourceId(undefined);
    setActiveView('datasets');
  }

  return (
    <main className="data-workspace-page">
      <header className="data-workspace-page__heading">
        <div>
          <h1>{text.heading}</h1>
          <p>{text.description}</p>
        </div>
      </header>
      <nav
        aria-label={locale === 'vi-VN' ? 'Chế độ xem dữ liệu' : 'Data views'}
        className="data-workspace-page__tabs"
      >
        {(
          [
            ['datasets', text.datasets],
            ['sources', text.sources],
            ['review', text.review],
          ] as const
        ).map(([view, label]) => (
          <button
            aria-pressed={activeView === view}
            className={activeView === view ? 'is-active' : undefined}
            key={view}
            onClick={() => setActiveView(view)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      {activeView === 'datasets' ? (
        <div className="data-workspace-page__datasets">
          <DatasetIndexPage
            datasets={datasets}
            heading={false}
            locale={locale}
            onSelectDataset={selectDataset}
            {...(selectedDatasetId === undefined ? {} : { selectedDatasetId })}
          />
          {selectedDataset === undefined ? null : (
            <DatasetDetailPage
              dataset={selectedDataset}
              locale={locale}
              onSelectSource={setSelectedSourceId}
              {...(selectedSourceId === undefined ? {} : { selectedSourceId })}
              {...(onConnectSource === undefined ? {} : { onConnectSource })}
              {...(onSelectFiles === undefined ? {} : { onSelectFiles })}
              {...(onOpenOriginal === undefined ? {} : { onOpenOriginal })}
              {...(onViewEvidence === undefined ? {} : { onViewEvidence })}
            />
          )}
        </div>
      ) : activeView === 'sources' ? (
        <section aria-label={text.sources} className="data-workspace-page__flat-list">
          <h2>{text.sources}</h2>
          {sources.length === 0 ? (
            <p className="data-section-empty">
              {locale === 'vi-VN'
                ? 'Chưa có tệp nguồn được cấp quyền.'
                : 'No authorized source files are available.'}
            </p>
          ) : (
            <ul>
              {sources.map(({ datasetLabel, source }) => (
                <li key={source.sourceId}>
                  <button
                    onClick={() =>
                      selectDataset(
                        datasets.find((item) => item.label === datasetLabel)?.datasetId ?? '',
                      )
                    }
                    type="button"
                  >
                    <strong>{source.label}</strong>
                    <span>{datasetLabel}</span>
                    <small>{source.sourceType}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-label={text.review} className="data-workspace-page__flat-list">
          <h2>{text.review}</h2>
          {reviewItems.length === 0 ? (
            <p className="data-section-empty">
              {locale === 'vi-VN'
                ? 'Không có mục cần xem xét được cấp quyền.'
                : 'No authorized review items are available.'}
            </p>
          ) : (
            <ul>
              {reviewItems.map(({ datasetLabel, review }) => (
                <li key={review.reviewId}>
                  <strong>{review.label}</strong>
                  <span>{datasetLabel}</span>
                  <small>{review.stateLabel}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
