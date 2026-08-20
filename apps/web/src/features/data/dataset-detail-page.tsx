import { Link } from 'react-router-dom';
import { DatasetPreviewTable } from './dataset-preview-table.tsx';
import { ExtractionReview } from './extraction-review.tsx';
import { OriginalViewer } from './original-viewer.tsx';
import { PreparationSummary } from './preparation-summary.tsx';
import { SourceFileList } from './source-file-list.tsx';
import { SourceUploadPanel } from './source-upload-panel.tsx';
import { normalizedDatasetHealth, type DatasetCardV1 } from './data-model.ts';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        refresh: 'Làm mới',
        review: 'Cần xem xét',
        versions: 'Phiên bản',
      }
    : {
        refresh: 'Refresh',
        review: 'Needs review',
        versions: 'Versions',
      };
}

export interface DatasetDetailPageProps {
  readonly dataset: DatasetCardV1;
  readonly locale: 'en' | 'vi-VN';
  readonly onConnectSource?: () => void;
  readonly onOpenOriginal?: (sourceId: string) => void;
  readonly onSelectFiles?: (files: FileList) => void;
  readonly onSelectSource?: (sourceId: string) => void;
  readonly onViewEvidence?: (sourceId: string) => void;
  readonly selectedSourceId?: string;
}

/** DDA-009/052/053: the detail combines one logical dataset's governed disclosures. */
export function DatasetDetailPage({
  dataset,
  locale,
  onConnectSource,
  onOpenOriginal,
  onSelectFiles,
  onSelectSource,
  onViewEvidence,
  selectedSourceId,
}: DatasetDetailPageProps) {
  const text = copy(locale);
  const health = normalizedDatasetHealth(dataset.health, locale);
  const sources = dataset.sources ?? [];
  const selectedSource = sources.find((source) => source.sourceId === selectedSourceId);
  const reviewFields = selectedSource?.extractionReview?.uncertainFields ?? [];

  return (
    <section aria-label={dataset.label} className="dataset-detail-page">
      <header className="dataset-detail-page__header">
        <div>
          <h2>{dataset.label}</h2>
          <p>{dataset.versionLabel}</p>
        </div>
        <span className={`dataset-detail-page__health is-${health.tone.toLowerCase()}`}>
          {health.label}
        </span>
      </header>
      <div className="dataset-detail-page__quick-actions">
        <Link
          className="db-button db-button--primary"
          to={`/${locale}/analysis?dataset=${encodeURIComponent(dataset.datasetId)}`}
        >
          {locale === 'vi-VN'
            ? '💬 Hỏi Trợ lý AI về dữ liệu này'
            : '💬 Ask AI Agent about this data'}
        </Link>
        <Link className="db-button db-button--secondary" to={`/${locale}/dashboards`}>
          {locale === 'vi-VN' ? '📊 Xem trên Bảng điều khiển' : '📊 View on Dashboards'}
        </Link>
      </div>
      <div className="dataset-detail-page__facts">
        {dataset.refresh === undefined ? null : (
          <section aria-label={text.refresh}>
            <h3>{text.refresh}</h3>
            <p>{dataset.refresh.stateLabel}</p>
            {dataset.refresh.lastSuccessfulLabel === undefined ? null : (
              <small>{dataset.refresh.lastSuccessfulLabel}</small>
            )}
            {dataset.refresh.reasonLabel === undefined ? null : (
              <small>{dataset.refresh.reasonLabel}</small>
            )}
          </section>
        )}
        {dataset.versions === undefined || dataset.versions.length === 0 ? null : (
          <section aria-label={text.versions}>
            <h3>{text.versions}</h3>
            <ul>
              {dataset.versions.map((version) => (
                <li key={version.versionId}>
                  <strong>{version.label}</strong>
                  <span>{version.stateLabel}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <SourceUploadPanel
        locale={locale}
        {...(onConnectSource === undefined ? {} : { onConnectSource })}
        {...(onSelectFiles === undefined ? {} : { onSelectFiles })}
      />
      {dataset.preparation === undefined ? null : (
        <PreparationSummary locale={locale} summary={dataset.preparation} />
      )}
      <DatasetPreviewTable dataset={dataset} locale={locale} />
      <div className="dataset-detail-page__content">
        <div>
          <SourceFileList
            files={sources}
            locale={locale}
            {...(onSelectSource === undefined ? {} : { onSelectFile: onSelectSource })}
            {...(selectedSourceId === undefined ? {} : { selectedSourceId })}
          />
          {dataset.reviewItems === undefined || dataset.reviewItems.length === 0 ? null : (
            <section aria-label={text.review} className="dataset-review-items">
              <div className="data-section-heading">
                <h2>{text.review}</h2>
              </div>
              <ul>
                {dataset.reviewItems.map((item) => (
                  <li key={item.reviewId}>
                    <strong>{item.label}</strong>
                    <span>{item.stateLabel}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {selectedSource === undefined ? null : (
          <aside className="dataset-detail-page__source-inspector">
            <OriginalViewer
              locale={locale}
              source={selectedSource}
              {...(onOpenOriginal === undefined ? {} : { onOpenOriginal })}
              {...(onViewEvidence === undefined ? {} : { onViewEvidence })}
            />
            {selectedSource.extractionReview === undefined ? null : (
              <ExtractionReview locale={locale} uncertainFields={reviewFields} />
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

export type { DatasetCardV1, DatasetSourceFileV1 } from './data-model.ts';
