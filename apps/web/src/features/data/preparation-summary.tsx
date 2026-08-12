export function PreparationSummary({
  locale,
  summary,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly summary: {
    readonly safeFixesApplied: number;
    readonly reviewRequired: number;
    readonly healthLabel: string;
  };
}) {
  return (
    <section aria-label={locale === 'vi-VN' ? 'Tóm tắt chuẩn bị' : 'Preparation summary'}>
      <h2>{locale === 'vi-VN' ? 'Chuẩn bị dữ liệu' : 'Data preparation'}</h2>
      <p>{summary.healthLabel}</p>
      <p>
        {locale === 'vi-VN'
          ? `${summary.safeFixesApplied} chỉnh sửa an toàn, ${summary.reviewRequired} cần xem xét`
          : `${summary.safeFixesApplied} safe fixes, ${summary.reviewRequired} need review`}
      </p>
    </section>
  );
}
