function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? { heading: 'Xem xét trích xuất', empty: 'Không có trường trích xuất cần xem xét.' }
    : { heading: 'Extraction review', empty: 'No extracted fields need review.' };
}

export function ExtractionReview({
  locale,
  uncertainFields,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly uncertainFields: readonly string[];
}) {
  const text = copy(locale);
  return (
    <section aria-label={text.heading} className="extraction-review">
      <div className="data-section-heading">
        <h2>{text.heading}</h2>
      </div>
      {uncertainFields.length === 0 ? (
        <p className="data-section-empty">{text.empty}</p>
      ) : (
        <ul>
          {uncertainFields.map((field) => (
            <li key={field}>{field}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
