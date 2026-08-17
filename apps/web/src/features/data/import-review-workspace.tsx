import { useState, useSyncExternalStore } from 'react';
import type { ImportApprovedResultV1, ImportSession } from './import-session.ts';
import './import-review-workspace.css';

export interface ImportReviewWorkspaceProps {
  readonly session: ImportSession;
  readonly locale: 'en' | 'vi-VN';
  readonly onApproved: (result: ImportApprovedResultV1) => void;
  readonly onCancel: () => void;
}

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        stepper: ['1. Tải lên', '2. Chuẩn hóa AI', '3. Xem xét thay đổi', '4. Đang xử lý', '5. Hoàn tất'],
        title: 'Xem xét và Phê duyệt Chuẩn hóa Dữ liệu',
        subtitle: 'Kiểm tra các biến đổi và kiểu dữ liệu được tự động nhận diện trước khi xuất bản phiên bản chính thức.',
        rawTable: 'Bảng dữ liệu gốc (Raw input)',
        cleanedTable: 'Bảng dữ liệu đã chuẩn hóa (Normalized output)',
        accountingTitle: 'Thống kê xử lý dòng',
        inputRows: 'Dòng đầu vào',
        outputRows: 'Dòng hợp lệ',
        transformedCols: 'Cột đã nhận diện kiểu',
        validityLabel: 'Tỷ lệ hợp lệ',
        trackServer: 'Được quản lý bởi máy chủ',
        trackLocal: 'Chạy cục bộ (ngoại tuyến)',
        creating: 'Đang tải lên và lập hồ sơ xem xét…',
        failedTitle: 'Không thể xử lý tệp',
        retry: 'Thử lại',
        feedbackTitle: 'Yêu cầu Trợ lý AI chỉnh lại quy tắc chuẩn hóa',
        feedbackPlaceholder: 'Ví dụ: Đổi cột Số lượng sang số nguyên, chuẩn hóa cột Ngày theo chuẩn DD/MM/YYYY...',
        requestRevision: 'Yêu cầu chỉnh lại',
        revising: 'Đang áp dụng thay đổi...',
        approve: 'Phê duyệt & Xuất bản',
        approving: 'Đang xuất bản...',
        cancel: 'Hủy bỏ',
        revisionApplied: '✓ Đã ghi nhận yêu cầu chỉnh sửa',
      }
    : {
        stepper: ['1. Upload', '2. AI Preparation', '3. Review Diff', '4. Processing', '5. Ready'],
        title: 'Review and Approve Data Preparation',
        subtitle: 'Inspect automatic transformations and inferred types before publishing the governed version.',
        rawTable: 'Raw Input Data',
        cleanedTable: 'Normalized Output Data',
        accountingTitle: 'Row Accounting',
        inputRows: 'Input rows',
        outputRows: 'Valid rows',
        transformedCols: 'Typed columns',
        validityLabel: 'Validity',
        trackServer: 'Server governed',
        trackLocal: 'Local (offline) run',
        creating: 'Uploading and preparing the review…',
        failedTitle: 'The files could not be processed',
        retry: 'Try again',
        feedbackTitle: 'Request AI Preparation Correction',
        feedbackPlaceholder: 'e.g. Treat Code column as text, format Date as YYYY-MM-DD...',
        requestRevision: 'Request Revision',
        revising: 'Applying revision...',
        approve: 'Approve & Publish',
        approving: 'Publishing...',
        cancel: 'Cancel',
        revisionApplied: '✓ Revision request recorded',
      };
}

const PARSE_ERROR_COPY: Readonly<Record<string, { readonly vi: string; readonly en: string }>> = {
  EMPTY_FILE: { vi: 'Tệp trống hoặc không có dòng dữ liệu.', en: 'The file is empty or has no data rows.' },
  NO_HEADERS: { vi: 'Không tìm thấy dòng tiêu đề cột.', en: 'No header row was found.' },
  HEADER_MISMATCH: { vi: 'Các tệp có tiêu đề cột không khớp nhau.', en: 'Files have mismatched column headers.' },
  LIMIT_EXCEEDED: { vi: 'Tệp vượt quá giới hạn kích thước hoặc số dòng.', en: 'A file exceeds the size or row limit.' },
  UNSUPPORTED_FORMAT: { vi: 'Định dạng tệp không được hỗ trợ.', en: 'Unsupported file format.' },
  SCHEMA_INCOMPATIBLE: { vi: 'Cột mới không tương thích với bộ dữ liệu hiện có.', en: 'New columns are incompatible with the existing dataset.' },
};

export function ImportReviewWorkspace({
  session,
  locale,
  onApproved,
  onCancel,
}: ImportReviewWorkspaceProps) {
  const text = copy(locale);
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const [feedback, setFeedback] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'diff' | 'cleaned' | 'raw'>('diff');

  const record = state.record;
  const parsed = state.parsed;
  const columns =
    parsed?.columns ??
    record?.sources[0]?.fields.map((field) => ({
      name: field.name,
      type: field.type,
      nullCount: 0,
      invalidCount: 0,
      convention: 'NONE' as const,
      sampleValues: [] as readonly string[],
    })) ??
    [];
  const sampleRows =
    parsed?.rows.slice(0, 6) ?? record?.review.afterSample.slice(0, 6) ?? [];
  const inputRows = record?.review.counts.input ?? parsed?.totalRows ?? 0;
  const outputRows = record?.review.counts.output ?? parsed?.totalRows ?? 0;
  const validity = record?.review.quality.validity ?? 1;
  const revisionCount = record?.revision ?? 1;
  const busy = state.status === 'CREATING' || state.status === 'APPROVING' || isRevising;

  async function handleRequestRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!feedback.trim() || busy) return;
    setIsRevising(true);
    try {
      await session.requestRevision(feedback.trim());
      setStatusMessage(text.revisionApplied);
      setFeedback('');
    } finally {
      setIsRevising(false);
    }
  }

  async function handleApprove() {
    const result = await session.approve();
    if (result !== undefined) onApproved(result);
  }

  async function handleRetry() {
    setStatusMessage(null);
    await session.start();
  }

  if (state.status === 'FAILED') {
    const errorCopy = state.error !== undefined
      ? PARSE_ERROR_COPY[state.error.code]
      : undefined;
    return (
      <div className="import-review-workspace" role="region" aria-label={text.failedTitle}>
        <header className="import-review-header">
          <div>
            <h2>{text.failedTitle}</h2>
            <p>
              {errorCopy
                ? locale === 'vi-VN'
                  ? errorCopy.vi
                  : errorCopy.en
                : (state.error?.message ?? state.error?.code ?? '')}
            </p>
            {state.error?.message && errorCopy ? (
              <small>{state.error.message}</small>
            ) : null}
          </div>
        </header>
        <footer className="import-review-footer">
          <button type="button" className="db-button db-button--secondary" onClick={onCancel}>
            {text.cancel}
          </button>
          <button type="button" className="db-button db-button--primary" onClick={() => void handleRetry()}>
            {text.retry}
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="import-review-workspace" role="region" aria-label={text.title}>
      {/* 5-Step Stepper Header */}
      <div className="import-review-stepper">
        {text.stepper.map((step, idx) => {
          const activeStep =
            state.status === 'APPROVING' || state.status === 'READY' ? 3 : state.status === 'CREATING' ? 1 : 2;
          return (
            <div
              key={step}
              className={`import-review-step${idx === activeStep ? ' is-active' : idx < activeStep ? ' is-completed' : ''}`}
            >
              <span className="import-review-step-num">{idx + 1}</span>
              <span className="import-review-step-name">{step}</span>
            </div>
          );
        })}
      </div>

      <header className="import-review-header">
        <div>
          <h2>{text.title}</h2>
          <p>{text.subtitle}</p>
          <small>
            {state.track === 'SERVER' ? `☁ ${text.trackServer}` : `💻 ${text.trackLocal}`}
          </small>
        </div>
        <div className="import-review-header-actions">
          <button type="button" className="db-button db-button--secondary" onClick={onCancel} disabled={busy}>
            {text.cancel}
          </button>
          <button
            type="button"
            className="db-button db-button--primary"
            onClick={() => void handleApprove()}
            disabled={busy || state.status !== 'REVIEW'}
          >
            ✓ {state.status === 'APPROVING' ? text.approving : text.approve}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div className="import-review-notice is-success" role="status">
          {statusMessage}
        </div>
      ) : null}

      {state.status === 'CREATING' ? (
        <p className="import-review-notice" role="status">
          {text.creating}
        </p>
      ) : null}

      {/* Row Accounting Stats Grid */}
      <div className="import-accounting-grid">
        <div className="import-accounting-card">
          <small>{text.inputRows}</small>
          <strong>{inputRows.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US')}</strong>
        </div>
        <div className="import-accounting-card is-success">
          <small>{text.outputRows}</small>
          <strong>{outputRows.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US')}</strong>
        </div>
        <div className="import-accounting-card">
          <small>{text.transformedCols}</small>
          <strong>
            {columns.length} {locale === 'vi-VN' ? 'cột' : 'cols'}
          </strong>
        </div>
        <div className="import-accounting-card is-highlight">
          <small>{text.validityLabel}</small>
          <strong>{(validity * 100).toFixed(1)}%</strong>
        </div>
      </div>

      {record?.review.warnings.length ? (
        <ul className="import-review-warnings" role="list">
          {record.review.warnings.map((warning) => (
            <li key={warning}>⚠ {warning}</li>
          ))}
        </ul>
      ) : null}

      {/* View switcher */}
      <div className="import-review-tabs">
        <button
          type="button"
          className={`import-review-tab${activeTab === 'diff' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('diff')}
        >
          🔍 {locale === 'vi-VN' ? 'So sánh biến đổi (Before / After Diff)' : 'Before / After Diff'}
        </button>
        <button
          type="button"
          className={`import-review-tab${activeTab === 'cleaned' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('cleaned')}
        >
          ✨ {text.cleanedTable}
        </button>
        <button
          type="button"
          className={`import-review-tab${activeTab === 'raw' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('raw')}
        >
          📄 {text.rawTable}
        </button>
      </div>

      {/* Diff Table */}
      <div className="import-diff-table-card">
        <div className="import-diff-table-wrapper" tabIndex={0}>
          <table className="import-diff-table">
            <thead>
              <tr>
                <th className="import-diff-th--index">#</th>
                {columns.map((c) => (
                  <th key={c.name} className="import-diff-th">
                    <div className="import-diff-head">
                      <span>{c.name}</span>
                      <span className={`import-type-badge type-${c.type.toLowerCase()}`}>
                        {c.type}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row, idx) => (
                <tr key={idx} className="import-diff-tr">
                  <td className="import-diff-td--index">{idx + 1}</td>
                  {columns.map((c) => {
                    const val = row[c.name];
                    const isNumeric = c.type === 'INTEGER' || c.type === 'DECIMAL';
                    return (
                      <td key={c.name} className="import-diff-td">
                        <div className="import-cell-diff">
                          <span className="import-cell-val">
                            {val === null || val === undefined ? (
                              <em className="import-null">null</em>
                            ) : typeof val === 'number' ? (
                              val.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US')
                            ) : (
                              String(val)
                            )}
                          </span>
                          {activeTab === 'diff' && isNumeric ? (
                            <small className="import-cell-tag is-numeric">✓ numeric</small>
                          ) : activeTab === 'diff' && c.type === 'DATE' ? (
                            <small className="import-cell-tag is-date">✓ date</small>
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issue-Linked AI Feedback Refinement Composer */}
      <form onSubmit={(event) => void handleRequestRevision(event)} className="import-feedback-composer">
        <label className="import-feedback-label" htmlFor="import-feedback-input">
          💬 {text.feedbackTitle}
        </label>
        <div className="import-feedback-input-row">
          <input
            id="import-feedback-input"
            className="import-feedback-input"
            placeholder={text.feedbackPlaceholder}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={busy}
          />
          <button
            type="submit"
            className="db-button db-button--secondary"
            disabled={!feedback.trim() || busy}
          >
            {isRevising ? text.revising : text.requestRevision}
          </button>
        </div>
        {record?.review.corrections.length ? (
          <ul className="import-review-corrections" role="list">
            {record.review.corrections.slice(-3).map((correction) => (
              <li key={correction.correctionId}>
                <small>↩ {correction.message}</small>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {/* Footer Actions */}
      <footer className="import-review-footer">
        <button type="button" className="db-button db-button--secondary" onClick={onCancel} disabled={busy}>
          {text.cancel}
        </button>
        <button
          type="button"
          className="db-button db-button--primary"
          onClick={() => void handleApprove()}
          disabled={busy || state.status !== 'REVIEW'}
        >
          ✓ {text.approve} ({locale === 'vi-VN' ? `Bản thảo ${revisionCount}` : `Revision ${revisionCount}`})
        </button>
      </footer>
    </div>
  );
}
