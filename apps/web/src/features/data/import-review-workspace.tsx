import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  DataImportApiError,
  dataImportApi,
  type DataImportMappingSuggestionV1,
} from './data-import-api.ts';
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
        stepper: [
          '1. Tải lên',
          '2. Chuẩn hóa tự động',
          '3. Xem xét thay đổi',
          '4. Đang xử lý',
          '5. Hoàn tất',
        ],
        title: 'Xem xét và Phê duyệt Chuẩn hóa Dữ liệu',
        subtitle:
          'Kiểm tra các chuẩn hóa an toàn và kiểu dữ liệu được nhận diện trước khi xuất bản phiên bản chính thức.',
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
        chooseAnotherFile: 'Chọn tệp khác',
        genericFailure: 'Không thể xử lý tệp lúc này. Hãy chọn lại tệp hoặc thử lại sau.',
        feedbackTitle: 'Gửi yêu cầu chỉnh sửa quy tắc chuẩn hóa',
        feedbackPlaceholder:
          'Ví dụ: Đổi cột Số lượng sang số nguyên, chuẩn hóa cột Ngày theo chuẩn DD/MM/YYYY...',
        requestRevision: 'Yêu cầu chỉnh lại',
        revising: 'Đang áp dụng thay đổi...',
        approve: 'Phê duyệt & Xuất bản',
        approving: 'Đang xuất bản...',
        cancel: 'Hủy bỏ',
        revisionApplied: '✓ Đã ghi nhận yêu cầu chỉnh sửa',
        revisionFailed: 'Không thể áp dụng yêu cầu chỉnh sửa. Bản xem trước vẫn giữ nguyên.',
        revisionConflict: 'Bản xem trước đã thay đổi trên máy chủ. Hãy tải lại rồi thử lại.',
        aiTitle: 'Gợi ý từ trợ lý AI',
        aiCaption: 'Chỉ là gợi ý tham khảo — không tự động thay đổi dữ liệu của bạn.',
        aiConsent: 'Cho phép gửi mẫu tối đa 20 dòng để nhận gợi ý ánh xạ cột',
        aiAsk: 'Xin gợi ý',
        aiAsking: 'Đang phân tích…',
        aiUnavailable: 'Gợi ý AI hiện chưa khả dụng. Bạn vẫn có thể yêu cầu chỉnh sửa thủ công.',
        aiDenied: 'Không thể gửi mẫu theo chính sách dữ liệu hiện tại.',
        aiEmpty: 'Chưa có gợi ý phù hợp — bản chuẩn hóa an toàn vẫn sẵn sàng để bạn xem.',
        aiAdvisory: 'Tham khảo',
        aiUse: 'Dùng làm yêu cầu chỉnh sửa',
        aiLocal: 'Luồng cục bộ không gọi AI máy chủ.',
      }
    : {
        stepper: [
          '1. Upload',
          '2. Automatic preparation',
          '3. Review diff',
          '4. Processing',
          '5. Ready',
        ],
        title: 'Review and Approve Data Preparation',
        subtitle:
          'Inspect safe normalization and inferred types before publishing the governed version.',
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
        chooseAnotherFile: 'Choose another file',
        genericFailure: 'The file cannot be processed right now. Choose it again or try later.',
        feedbackTitle: 'Request a preparation correction',
        feedbackPlaceholder: 'e.g. Treat Code column as text, format Date as YYYY-MM-DD...',
        requestRevision: 'Request Revision',
        revising: 'Applying revision...',
        approve: 'Approve & Publish',
        approving: 'Publishing...',
        cancel: 'Cancel',
        revisionApplied: '✓ Revision request recorded',
        revisionFailed: 'The revision could not be applied. The preview is unchanged.',
        revisionConflict: 'This preview changed on the server. Reload it, then try again.',
        aiTitle: 'AI mapping suggestions',
        aiCaption: 'Advisory only — suggestions never change or approve your data automatically.',
        aiConsent: 'Allow up to 20 sample rows to be sent for suggestions',
        aiAsk: 'Get suggestions',
        aiAsking: 'Analyzing…',
        aiUnavailable: 'AI suggestions are unavailable. You can still request a manual correction.',
        aiDenied: 'Samples cannot be sent under the current data policy.',
        aiEmpty:
          'No compatible suggestions were found — safe preparation is still ready for review.',
        aiAdvisory: 'Advisory',
        aiUse: 'Use as correction request',
        aiLocal: 'The local track does not call the server AI provider.',
      };
}

const PARSE_ERROR_COPY: Readonly<Record<string, { readonly vi: string; readonly en: string }>> = {
  EMPTY_FILE: {
    vi: 'Tệp trống hoặc không có dòng dữ liệu.',
    en: 'The file is empty or has no data rows.',
  },
  NO_HEADERS: { vi: 'Không tìm thấy dòng tiêu đề cột.', en: 'No header row was found.' },
  HEADER_MISMATCH: {
    vi: 'Các tệp có tiêu đề cột không khớp nhau.',
    en: 'Files have mismatched column headers.',
  },
  LIMIT_EXCEEDED: {
    vi: 'Tệp vượt quá giới hạn kích thước hoặc số dòng.',
    en: 'A file exceeds the size or row limit.',
  },
  UNSUPPORTED_FORMAT: { vi: 'Định dạng tệp không được hỗ trợ.', en: 'Unsupported file format.' },
  SCHEMA_INCOMPATIBLE: {
    vi: 'Cột mới không tương thích với bộ dữ liệu hiện có.',
    en: 'New columns are incompatible with the existing dataset.',
  },
  DDA_INTAKE_MALFORMED_ENCODING: {
    vi: 'Mã hóa ký tự của tệp CSV không hợp lệ. Hãy lưu tệp dưới dạng UTF-8 hoặc Windows-1258 rồi chọn lại.',
    en: 'The CSV character encoding is malformed. Save it as UTF-8 or Windows-1258, then choose the file again.',
  },
  DDA_INTAKE_UNSUPPORTED_ENCODING: {
    vi: 'Mã hóa ký tự của tệp CSV chưa được hỗ trợ. Hãy lưu tệp dưới dạng UTF-8 hoặc Windows-1258 rồi chọn lại.',
    en: 'The CSV character encoding is not supported. Save it as UTF-8 or Windows-1258, then choose the file again.',
  },
  DDA_INTAKE_LIMIT_ROWS: {
    vi: 'Tệp vượt quá giới hạn 1.000.000 dòng do máy chủ áp dụng. Hãy chia tệp thành các phần nhỏ hơn rồi chọn lại.',
    en: 'The file exceeds the server limit of 1,000,000 rows. Split it into smaller files, then choose it again.',
  },
  DDA_INTAKE_LIMIT_COLUMNS: {
    vi: 'Tệp có nhiều cột hơn hồ sơ nhập liệu cho phép. Hãy giảm số cột rồi chọn lại.',
    en: 'The file has more columns than the import profile allows. Reduce the columns, then choose it again.',
  },
  DDA_INTAKE_LIMIT_SIZE: {
    vi: 'Tệp vượt quá giới hạn 100 MiB. Hãy chọn tệp nhỏ hơn.',
    en: 'The file exceeds the 100 MiB limit. Choose a smaller file.',
  },
  DATA_IMPORT_UNAVAILABLE: {
    vi: 'Dịch vụ nhập dữ liệu tạm thời chưa khả dụng. Bạn có thể thử lại an toàn.',
    en: 'Data import is temporarily unavailable. You can safely try again.',
  },
};

const RETRYABLE_IMPORT_ERROR_CODES = new Set(['DATA_IMPORT_UNAVAILABLE']);

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
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'diff' | 'cleaned' | 'raw'>('diff');
  const [mappingSuggestions, setMappingSuggestions] = useState<
    readonly DataImportMappingSuggestionV1[]
  >([]);
  const [mappingStatus, setMappingStatus] = useState<'IDLE' | 'ASKING' | 'READY' | 'ERROR'>('IDLE');
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [samplePermissionGranted, setSamplePermissionGranted] = useState(false);

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
  // A live review must render the persisted server projection after every
  // correction and after a reload. The browser's parsed bytes are only the
  // local/demo fallback; otherwise they would mask the authoritative
  // before/after sample returned by the correction command.
  const sampleRows =
    state.track === 'SERVER'
      ? activeTab === 'raw'
        ? (record?.review.beforeSample.slice(0, 6) ?? [])
        : (record?.review.afterSample.slice(0, 6) ?? [])
      : (parsed?.rows.slice(0, 6) ?? []);
  const inputRows = record?.review.counts.input ?? parsed?.totalRows ?? 0;
  const outputRows = record?.review.counts.output ?? parsed?.totalRows ?? 0;
  const validity = record?.review.quality.validity ?? 1;
  const revisionCount = record?.revision ?? 1;
  const busy = state.status === 'CREATING' || state.status === 'APPROVING' || isRevising;

  useEffect(() => {
    setMappingSuggestions([]);
    setMappingStatus('IDLE');
    setMappingError(null);
  }, [record?.importId, record?.revision]);

  async function handleAskMappingSuggestions() {
    if (
      record === undefined ||
      state.track !== 'SERVER' ||
      !samplePermissionGranted ||
      busy ||
      mappingStatus === 'ASKING'
    )
      return;
    setMappingStatus('ASKING');
    setMappingError(null);
    try {
      const result = await dataImportApi.mappingSuggestions(
        record.importId,
        samplePermissionGranted,
        locale === 'vi-VN' ? 'vi' : 'en',
      );
      setMappingSuggestions(result.suggestions);
      setMappingStatus('READY');
    } catch (error) {
      setMappingStatus('ERROR');
      const code = error instanceof DataImportApiError ? error.code : 'DATA_IMPORT_UNAVAILABLE';
      setMappingError(
        ['AI_EGRESS_DENIED', 'PURPOSE_DENIED', 'SAMPLE_PERMISSION_DENIED'].includes(code)
          ? text.aiDenied
          : text.aiUnavailable,
      );
    }
  }

  function useSuggestion(suggestion: DataImportMappingSuggestionV1) {
    setFeedback(
      locale === 'vi-VN'
        ? `${suggestion.summary} (cột ${suggestion.sourceField} → ${suggestion.targetField})`
        : `${suggestion.summary} (${suggestion.sourceField} → ${suggestion.targetField})`,
    );
    setStatusMessage(null);
    setRevisionError(null);
  }

  async function handleRequestRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!feedback.trim() || busy) return;
    setIsRevising(true);
    setStatusMessage(null);
    setRevisionError(null);
    try {
      const applied = await session.requestRevision(feedback.trim());
      if (applied) {
        setStatusMessage(text.revisionApplied);
        setFeedback('');
      } else {
        const error = session.getState().error;
        setRevisionError(
          error?.code.includes('REVISION')
            ? text.revisionConflict
            : (error?.message ?? text.revisionFailed),
        );
      }
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
    const errorCopy = state.error !== undefined ? PARSE_ERROR_COPY[state.error.code] : undefined;
    const retryable =
      state.error !== undefined && RETRYABLE_IMPORT_ERROR_CODES.has(state.error.code);
    return (
      <div className="import-review-workspace" role="region" aria-label={text.failedTitle}>
        <header className="import-review-header">
          <div>
            <h2>{text.failedTitle}</h2>
            <p>
              {errorCopy ? (locale === 'vi-VN' ? errorCopy.vi : errorCopy.en) : text.genericFailure}
            </p>
          </div>
        </header>
        <footer className="import-review-footer">
          <button type="button" className="db-button db-button--secondary" onClick={onCancel}>
            {retryable ? text.cancel : text.chooseAnotherFile}
          </button>
          {retryable ? (
            <button
              type="button"
              className="db-button db-button--primary"
              onClick={() => void handleRetry()}
            >
              {text.retry}
            </button>
          ) : null}
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
            state.status === 'APPROVING' || state.status === 'READY'
              ? 3
              : state.status === 'CREATING'
                ? 1
                : 2;
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
          <button
            type="button"
            className="db-button db-button--secondary"
            onClick={onCancel}
            disabled={busy}
          >
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
      {revisionError ? (
        <div className="import-review-notice is-error" role="alert">
          {revisionError}
        </div>
      ) : null}

      {state.track === 'SERVER' && record !== undefined ? (
        <p className="import-review-notice" role="status">
          {locale === 'vi-VN'
            ? 'Đây là bản xem trước chuẩn hóa do máy chủ tạo từ tệp bất biến. Chỉ phiên bản sau khi bạn duyệt mới được ghi nhận.'
            : 'This is a server-generated normalization preview from immutable source files. Only the version you approve is recorded.'}
        </p>
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

      <section className="import-ai-suggestions" aria-labelledby="import-ai-suggestions-title">
        <div className="import-ai-suggestions__header">
          <div>
            <span className="import-ai-suggestions__eyebrow">✦ {text.aiAdvisory}</span>
            <h3 id="import-ai-suggestions-title">{text.aiTitle}</h3>
            <p>{text.aiCaption}</p>
          </div>
          {state.track === 'SERVER' ? (
            <button
              type="button"
              className="db-button db-button--secondary"
              onClick={() => void handleAskMappingSuggestions()}
              disabled={!samplePermissionGranted || busy || mappingStatus === 'ASKING'}
            >
              {mappingStatus === 'ASKING' ? text.aiAsking : text.aiAsk}
            </button>
          ) : null}
        </div>
        {state.track === 'SERVER' ? (
          <label className="import-ai-suggestions__consent">
            <input
              type="checkbox"
              checked={samplePermissionGranted}
              onChange={(event) => setSamplePermissionGranted(event.target.checked)}
              disabled={busy || mappingStatus === 'ASKING'}
            />
            <span>{text.aiConsent}</span>
          </label>
        ) : (
          <p className="import-ai-suggestions__muted">{text.aiLocal}</p>
        )}
        {mappingError ? (
          <p className="import-ai-suggestions__error" role="alert">
            {mappingError}
          </p>
        ) : null}
        {mappingStatus === 'READY' && mappingSuggestions.length === 0 ? (
          <p className="import-ai-suggestions__muted">{text.aiEmpty}</p>
        ) : null}
        {mappingSuggestions.length > 0 ? (
          <ul className="import-ai-suggestions__list" role="list">
            {mappingSuggestions.map((suggestion, index) => (
              <li key={`${suggestion.sourceField}:${suggestion.targetField}:${index}`}>
                <div className="import-ai-suggestion-card">
                  <div className="import-ai-suggestion-card__topline">
                    <strong>{suggestion.label}</strong>
                    <span
                      className={`import-ai-suggestion-card__confidence is-${suggestion.uncertainty.toLowerCase()}`}
                    >
                      {suggestion.uncertainty}
                    </span>
                  </div>
                  <p>{suggestion.summary}</p>
                  <small>
                    {suggestion.sourceField} → {suggestion.targetField} · {suggestion.transformKind}
                  </small>
                  <small>{suggestion.rationale}</small>
                  <button
                    type="button"
                    className="import-ai-suggestion-card__use"
                    onClick={() => useSuggestion(suggestion)}
                    disabled={busy}
                  >
                    {text.aiUse}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

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
      <form
        onSubmit={(event) => void handleRequestRevision(event)}
        className="import-feedback-composer"
      >
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
        <button
          type="button"
          className="db-button db-button--secondary"
          onClick={onCancel}
          disabled={busy}
        >
          {text.cancel}
        </button>
        <button
          type="button"
          className="db-button db-button--primary"
          onClick={() => void handleApprove()}
          disabled={busy || state.status !== 'REVIEW'}
        >
          ✓ {text.approve} (
          {locale === 'vi-VN' ? `Bản thảo ${revisionCount}` : `Revision ${revisionCount}`})
        </button>
      </footer>
    </div>
  );
}
