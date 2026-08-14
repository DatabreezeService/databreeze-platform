import {
  QualityDimensions,
  type QualityDimensionViewV1,
} from '../data-intake/quality-dimensions.tsx';

export interface PreparationSummaryPanelProps {
  readonly locale?: 'vi' | 'en';
  readonly mode: 'FIRST_IMPORT' | 'COMPATIBLE_REFRESH' | 'REVIEW';
  readonly automaticPolicy: 'SAFE_NON_LOSSY' | 'NONE';
  readonly counts: {
    readonly input: number;
    readonly output: number;
    readonly unchanged: number;
    readonly changed: number;
    readonly rejected: number;
    readonly quarantined: number;
    readonly unsupported: number;
  };
  readonly transformations: readonly string[];
  readonly warnings: readonly string[];
  readonly healthDimensions: readonly QualityDimensionViewV1[];
  readonly overallSummary?: {
    readonly formula: string;
    readonly coverage: number;
    readonly provesFactualCorrectness: false;
  };
}

/** DDA-053: first-import full summary, compact refresh notice, or full review. */
export function PreparationSummaryPanel({
  locale = 'vi',
  mode,
  automaticPolicy,
  counts,
  transformations,
  warnings,
  healthDimensions,
  overallSummary,
}: PreparationSummaryPanelProps) {
  const copy =
    locale === 'en'
      ? {
          changed: 'Changed safely',
          input: 'Input rows',
          output: 'Output rows',
          policy: 'Automatic policy',
          quarantined: 'Quarantined',
          rejected: 'Rejected',
          transformations: 'What changed',
          unchanged: 'Unchanged',
          unsupported: 'Unsupported',
          warnings: 'Needs attention',
        }
      : {
          changed: 'Đã đổi an toàn',
          input: 'Hàng đầu vào',
          output: 'Hàng đầu ra',
          policy: 'Chính sách tự động',
          quarantined: 'Đã cách ly',
          rejected: 'Đã từ chối',
          transformations: 'Những gì đã thay đổi',
          unchanged: 'Không đổi',
          unsupported: 'Không hỗ trợ',
          warnings: 'Cần chú ý',
        };
  const title =
    locale === 'en'
      ? mode === 'COMPATIBLE_REFRESH'
        ? 'Preparation refresh'
        : mode === 'REVIEW'
          ? 'Preparation review'
          : 'Preparation summary'
      : mode === 'COMPATIBLE_REFRESH'
        ? 'Làm mới chuẩn bị'
        : mode === 'REVIEW'
          ? 'Xem xét chuẩn bị'
          : 'Tóm tắt chuẩn bị';

  if (mode === 'COMPATIBLE_REFRESH') {
    return (
      <section aria-label={title} className="preparation-summary-panel is-compact">
        <h3>{title}</h3>
        <p>
          {locale === 'en'
            ? `Compatible refresh accepted under ${automaticPolicy}. output=${counts.output}.`
            : `Làm mới tương thích đã chấp nhận theo ${automaticPolicy}. đầu ra=${counts.output}.`}
        </p>
      </section>
    );
  }

  return (
    <section aria-label={title} className="preparation-summary-panel">
      <header className="preparation-summary-panel__header">
        <div>
          <p>{copy.policy}</p>
          <h3>{title}</h3>
        </div>
        <span>
          {automaticPolicy === 'SAFE_NON_LOSSY'
            ? locale === 'en'
              ? 'Safe, non-lossy'
              : 'An toàn, không mất dữ liệu'
            : automaticPolicy}
        </span>
      </header>
      <dl className="preparation-summary-panel__counts">
        {(
          [
            [copy.input, counts.input],
            [copy.output, counts.output],
            [copy.unchanged, counts.unchanged],
            [copy.changed, counts.changed],
            [copy.quarantined, counts.quarantined],
            [copy.rejected, counts.rejected],
            [copy.unsupported, counts.unsupported],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value.toLocaleString(locale === 'en' ? 'en' : 'vi-VN')}</dd>
          </div>
        ))}
      </dl>
      <section
        className="preparation-summary-panel__transformations"
        aria-label={copy.transformations}
      >
        <h4>{copy.transformations}</h4>
        <ul>
          {transformations.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </section>
      {warnings.length > 0 ? (
        <aside className="preparation-summary-panel__warnings" aria-label={copy.warnings}>
          <strong>{copy.warnings}</strong>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      ) : null}
      <QualityDimensions
        dimensions={healthDimensions}
        locale={locale}
        {...(overallSummary === undefined ? {} : { overallSummary })}
      />
    </section>
  );
}
