import { useState } from 'react';
import type { DatasetCardV1, DatasetRecordV1 } from './data-model.ts';
import { toDatasetCardV1 } from './data-model.ts';
import { DatasetPreviewTable } from './dataset-preview-table.tsx';
import { SourceFileList } from './source-file-list.tsx';
import { OriginalViewer } from './original-viewer.tsx';
import { PreparationSummary } from './preparation-summary.tsx';

export interface DataPipelinePanelProps {
  readonly record: DatasetRecordV1;
  readonly locale: 'en' | 'vi-VN';
  readonly onApprove: () => void;
  readonly onOpenAgent: () => void;
  readonly onOpenOriginal?: (sourceId: string) => void;
  readonly onViewEvidence?: (sourceId: string) => void;
  readonly agentOpen: boolean;
  /** Server-provided card carrying authoritative display labels, when applicable. */
  readonly displayCard?: DatasetCardV1;
}

type PipelineTabV1 = 'overview' | 'data' | 'cleaning' | 'versions';

function stageIndex(record: DatasetRecordV1): number {
  switch (record.cleaningState ?? 'RAW') {
    case 'RAW':
      return 0;
    case 'CLEANING':
      return 1;
    case 'REVIEW':
      return 2;
    case 'APPROVED':
      return 3;
  }
}

function qualityPercent(value: number | undefined): string {
  return value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

export function DataPipelinePanel({
  record,
  locale,
  onApprove,
  onOpenAgent,
  onOpenOriginal,
  onViewEvidence,
  agentOpen,
  displayCard,
}: DataPipelinePanelProps) {
  const vi = locale === 'vi-VN';
  const [tab, setTab] = useState<PipelineTabV1>('overview');
  const [selectedSourceId, setSelectedSourceId] = useState<string | undefined>();
  const card: DatasetCardV1 = displayCard ?? toDatasetCardV1(record, locale);
  const selectedSource =
    selectedSourceId === undefined
      ? undefined
      : record.sources.find((source) => source.sourceId === selectedSourceId);
  const stage = stageIndex(record);
  const steps = vi
    ? ['Nạp', 'Chuẩn hóa', 'Xem xét', 'Duyệt']
    : ['Ingest', 'Clean', 'Review', 'Approve'];
  const approved = record.cleaningState === 'APPROVED';
  const revisions = record.appliedRevisions ?? [];
  const warnings = record.preparation?.warnings ?? [];

  return (
    <section className="pipeline-panel" aria-labelledby="pipeline-title">
      <header className="pipeline-panel__header">
        <div className="pipeline-panel__heading">
          <h1 id="pipeline-title">{record.label}</h1>
          <div className="pipeline-panel__meta">
            <span className="pipeline-panel__version">{card.versionLabel}</span>
            {typeof card.health === 'object' ? (
              <span className="pipeline-panel__state">{card.health.label}</span>
            ) : null}
            <span
              className={`pipeline-panel__state pipeline-panel__state--${(record.cleaningState ?? 'RAW').toLowerCase()}`}
            >
              {approved ? (vi ? '🔒 Đã duyệt' : '🔒 Approved') : (record.cleaningState ?? 'RAW')}
            </span>
            {record.origin === 'SERVER' ? (
              <span className="pipeline-panel__origin">☁ server</span>
            ) : null}
            {card.refresh?.lastSuccessfulLabel !== undefined ? (
              <span className="pipeline-panel__version">{card.refresh.lastSuccessfulLabel}</span>
            ) : null}
          </div>
        </div>
        <div className="pipeline-panel__actions">
          {record.origin === 'LOCAL' && !agentOpen ? (
            <button type="button" className="db-button db-button--secondary" onClick={onOpenAgent}>
              ✦ {vi ? 'Trợ lý dữ liệu' : 'Data agent'}
            </button>
          ) : null}
          {!approved ? (
            <button
              type="button"
              className="db-button db-button--primary"
              onClick={onApprove}
              disabled={
                (record.cleaningState ?? 'RAW') === 'RAW' &&
                revisions.length === 0 &&
                (record.quality?.validity ?? 1) < 0.5
              }
            >
              🔒 {vi ? 'Duyệt & khóa phiên bản' : 'Approve & lock version'}
            </button>
          ) : null}
        </div>
      </header>

      <ol className="pipeline-panel__stages" aria-label={vi ? 'Tiến trình' : 'Progress'}>
        {steps.map((step, index) => (
          <li
            key={step}
            className={`pipeline-stage${index < stage ? ' is-done' : ''}${index === stage ? ' is-active' : ''}`}
            aria-current={index === stage ? 'step' : undefined}
          >
            <span className="pipeline-stage__dot">{index < stage ? '✓' : index + 1}</span>
            <span className="pipeline-stage__name">{step}</span>
            {index < steps.length - 1 ? (
              <span className="pipeline-stage__connector" aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>

      <nav
        className="pipeline-panel__tabs"
        aria-label={vi ? 'Chi tiết bộ dữ liệu' : 'Dataset details'}
      >
        {(
          [
            ['overview', vi ? 'Tổng quan' : 'Overview'],
            ['data', vi ? 'Dữ liệu' : 'Data'],
            [
              'cleaning',
              vi
                ? `Chuẩn hóa${revisions.length > 0 ? ` (${revisions.length})` : ''}`
                : `Cleaning${revisions.length > 0 ? ` (${revisions.length})` : ''}`,
            ],
            ['versions', vi ? 'Phiên bản' : 'Versions'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'is-active' : undefined}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <div className="pipeline-panel__body">
          {record.origin === 'SERVER' ? (
            <p className="pipeline-server-note" role="status">
              {vi
                ? 'Phiên bản này được quản lý bởi máy chủ. Yêu cầu chỉnh sửa được thực hiện trong màn hình Xem xét trước khi phê duyệt; không có trợ lý cục bộ giả mạo ở đây.'
                : 'This version is server-governed. Request corrections in the Review screen before approval; no local-only assistant is shown here.'}
            </p>
          ) : null}
          <div className="pipeline-quality-grid">
            {(
              [
                [vi ? 'Đầy đủ' : 'Completeness', record.quality?.completeness],
                [vi ? 'Hợp lệ' : 'Validity', record.quality?.validity],
                [vi ? 'Duy nhất' : 'Uniqueness', record.quality?.uniqueness],
                [vi ? 'Nhất quán' : 'Consistency', record.quality?.consistency],
              ] as const
            ).map(([label, value]) => (
              <div className="pipeline-quality-card" key={label}>
                <small>{label}</small>
                <strong>{qualityPercent(value)}</strong>
                <div className="pipeline-quality-bar">
                  <span style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="pipeline-facts">
            <div>
              <small>{vi ? 'Dòng hiện tại' : 'Current rows'}</small>
              <strong>
                {record.currentVersion.rowCount.toLocaleString(vi ? 'vi-VN' : 'en-US')}
              </strong>
            </div>
            <div>
              <small>{vi ? 'Cột' : 'Columns'}</small>
              <strong>{record.currentVersion.schema.length}</strong>
            </div>
            <div>
              <small>{vi ? 'Nguồn' : 'Sources'}</small>
              <strong>{record.sources.length}</strong>
            </div>
            <div>
              <small>{vi ? 'Bản sửa bởi trợ lý' : 'Agent revisions'}</small>
              <strong>{revisions.length}</strong>
            </div>
          </div>

          {warnings.length > 0 ? (
            <ul className="pipeline-warnings" role="list">
              {warnings.map((warning) => (
                <li key={warning}>⚠ {warning}</li>
              ))}
            </ul>
          ) : null}

          {record.sources.length > 0 ? (
            <div className="pipeline-sources">
              <SourceFileList
                files={record.sources}
                locale={locale}
                onSelectFile={setSelectedSourceId}
                {...(selectedSourceId === undefined ? {} : { selectedSourceId })}
              />
              {selectedSource !== undefined ? (
                <OriginalViewer
                  locale={locale}
                  source={selectedSource}
                  {...(onOpenOriginal === undefined ? {} : { onOpenOriginal })}
                  {...(onViewEvidence === undefined ? {} : { onViewEvidence })}
                />
              ) : null}
            </div>
          ) : null}

          {record.preparation !== undefined ? (
            <PreparationSummary locale={locale} summary={record.preparation} />
          ) : null}
        </div>
      ) : tab === 'data' ? (
        <div className="pipeline-panel__body">
          <DatasetPreviewTable dataset={card} locale={locale} />
        </div>
      ) : tab === 'cleaning' ? (
        <div className="pipeline-panel__body">
          {revisions.length === 0 ? (
            <p className="pipeline-empty">
              {vi
                ? 'Chưa có bản chuẩn hóa nào. Mở Trợ lý Dữ liệu để bắt đầu làm sạch.'
                : 'No cleaning revisions yet. Open the Data Agent to start cleaning.'}
            </p>
          ) : (
            <ol className="pipeline-revisions">
              {revisions.map((revision, index) => (
                <li key={revision.revisionId}>
                  <div className="pipeline-revision__head">
                    <span className="pipeline-revision__index">#{index + 1}</span>
                    <span>{vi ? revision.summaryVi : revision.summaryEn}</span>
                    {revision.lossy ? (
                      <span className="pipeline-revision__lossy">
                        {vi ? '⚠ cần xác nhận' : '⚠ confirmed'}
                      </span>
                    ) : (
                      <span className="pipeline-revision__safe">{vi ? '✓ an toàn' : '✓ safe'}</span>
                    )}
                    <time dateTime={revision.createdAt}>
                      {new Date(revision.createdAt).toLocaleString(vi ? 'vi-VN' : 'en-US')}
                    </time>
                  </div>
                  <small>
                    {vi ? 'Dòng' : 'Rows'}:{' '}
                    {revision.rowCountBefore.toLocaleString(vi ? 'vi-VN' : 'en-US')} →{' '}
                    {revision.rowCountAfter.toLocaleString(vi ? 'vi-VN' : 'en-US')}
                  </small>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <div className="pipeline-panel__body">
          <ol className="pipeline-versions">
            {[...record.versions].reverse().map((version, index) => (
              <li key={version.versionId}>
                <span className="pipeline-versions__index">
                  {vi
                    ? `Phiên bản ${record.versions.length - index}`
                    : `Version ${record.versions.length - index}`}
                </span>
                <span>
                  {version.rowCount.toLocaleString(vi ? 'vi-VN' : 'en-US')} {vi ? 'hàng' : 'rows'} ·{' '}
                  {version.schema.length} {vi ? 'cột' : 'cols'}
                </span>
                <time dateTime={version.createdAt}>
                  {new Date(version.createdAt).toLocaleString(vi ? 'vi-VN' : 'en-US')}
                </time>
                {version.versionId === record.currentVersion.versionId ? (
                  <span className="pipeline-versions__current">{vi ? 'Hiện tại' : 'Current'}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
