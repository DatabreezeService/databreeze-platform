import { QualityDimensions, type QualityDimensionViewV1 } from '../data-intake/quality-dimensions.tsx';

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
      <section aria-label={title}>
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
    <section aria-label={title}>
      <h3>{title}</h3>
      <p>
        {locale === 'en' ? 'Policy' : 'Chính sách'}: {automaticPolicy}
      </p>
      <p>
        input={counts.input} output={counts.output} unchanged={counts.unchanged}{' '}
        changed={counts.changed} rejected={counts.rejected} quarantined={counts.quarantined}{' '}
        unsupported={counts.unsupported}
      </p>
      <ul aria-label={locale === 'en' ? 'Transformations' : 'Phép biến đổi'}>
        {transformations.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      {warnings.length > 0 ? (
        <ul aria-label={locale === 'en' ? 'Warnings' : 'Cảnh báo'}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <QualityDimensions
        dimensions={healthDimensions}
        locale={locale}
        {...(overallSummary === undefined ? {} : { overallSummary })}
      />
    </section>
  );
}
