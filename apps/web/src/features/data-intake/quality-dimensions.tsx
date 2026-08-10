export interface QualityDimensionViewV1 {
  readonly dimension: string;
  readonly denominator: number;
  readonly coverage: number;
  readonly rule: string;
  readonly expectation: string;
  readonly sampleState: string;
  readonly limitations: readonly string[];
}

export interface QualityDimensionsProps {
  readonly dimensions: readonly QualityDimensionViewV1[];
  readonly overallSummary?: {
    readonly formula: string;
    readonly coverage: number;
    readonly provesFactualCorrectness: false;
  };
  readonly locale?: 'vi' | 'en';
}

/** DDA-009/010 leaf: separated quality dimensions, never percentage-correct. */
export function QualityDimensions({
  dimensions,
  overallSummary,
  locale = 'vi',
}: QualityDimensionsProps) {
  const title = locale === 'en' ? 'Quality dimensions' : 'Chieu chat luong';
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {dimensions.map((item) => (
          <li key={item.dimension}>
            <strong>{item.dimension}</strong>: {item.coverage}/{item.denominator} · {item.rule} ·{' '}
            {item.expectation} · sample={item.sampleState}
            {item.limitations.length > 0 ? ` · limits: ${item.limitations.join('; ')}` : ''}
          </li>
        ))}
      </ul>
      {overallSummary ? (
        <p>
          {locale === 'en' ? 'Summary formula' : 'Cong thuc tong hop'}: {overallSummary.formula}.{' '}
          {locale === 'en'
            ? 'Does not prove factual correctness.'
            : 'Khong chung minh do chinh xac thuc te.'}
        </p>
      ) : null}
    </section>
  );
}
