export function ExtractionReview({
  locale,
  uncertainFields,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly uncertainFields: readonly string[];
}) {
  return (
    <section aria-label={locale === 'vi-VN' ? 'Xem xét trích xuất' : 'Extraction review'}>
      <h2>{locale === 'vi-VN' ? 'Cần xem xét' : 'Needs review'}</h2>
      <ul>
        {uncertainFields.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>
    </section>
  );
}
