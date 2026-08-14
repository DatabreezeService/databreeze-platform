export interface QualityDimensionViewV1 {
  readonly dimension: string;
  readonly numerator?: number;
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

/** DDA-009/010/053 leaf: separated quality dimensions, never percentage-correct. */
export function QualityDimensions({
  dimensions,
  overallSummary,
  locale = 'vi',
}: QualityDimensionsProps) {
  const text =
    locale === 'en'
      ? {
          checked: 'rows passed',
          coverage: 'rule coverage',
          denominator: 'rows checked',
          expectation: 'Expectation',
          limitations: 'Limitations',
          rule: 'Rule',
          sample: 'Scope',
          summary: 'Summary formula',
          warning: 'This measures rule coverage, not factual correctness.',
          title: 'Quality dimensions',
        }
      : {
          checked: 'hàng đạt quy tắc',
          coverage: 'mức đạt quy tắc',
          denominator: 'hàng đã kiểm tra',
          expectation: 'Mong đợi',
          limitations: 'Giới hạn',
          rule: 'Quy tắc',
          sample: 'Phạm vi',
          summary: 'Công thức tổng hợp',
          warning: 'Tỷ lệ này đo mức đạt quy tắc, không khẳng định dữ liệu đúng với thực tế.',
          title: 'Chiều chất lượng',
        };
  const percentage = new Intl.NumberFormat(locale === 'en' ? 'en' : 'vi-VN', {
    style: 'percent',
    maximumFractionDigits: 2,
  });
  return (
    <section className="quality-card" aria-label={text.title}>
      <h3>{text.title}</h3>
      <ul>
        {dimensions.map((item) => (
          <li className="quality-card__item" key={item.dimension}>
            <strong>{item.dimension}</strong>
            <span>
              {percentage.format(item.coverage)} {text.coverage}
            </span>
            <small>
              {item.numerator === undefined ? '' : `${item.numerator} ${text.checked} · `}
              {item.denominator} {text.denominator}
            </small>
            <small>
              {text.rule}: {item.rule} · {text.expectation}: {item.expectation}
            </small>
            <small>
              {text.sample}: {item.sampleState}
            </small>
            {item.limitations.length > 0 ? (
              <small>
                {text.limitations}: {item.limitations.join('; ')}
              </small>
            ) : null}
          </li>
        ))}
      </ul>
      {overallSummary ? (
        <p>
          {text.summary}: {overallSummary.formula} · {percentage.format(overallSummary.coverage)}.{' '}
          {text.warning}
        </p>
      ) : null}
    </section>
  );
}
