export function OriginalViewer({
  locale,
  kind,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly kind: 'CSV' | 'XLSX' | 'IMAGE' | 'PDF';
}) {
  return (
    <section aria-label={locale === 'vi-VN' ? 'Xem bản gốc' : 'Original viewer'}>
      <p>
        {locale === 'vi-VN' ? `Đang xem bản gốc ${kind}` : `Viewing original ${kind}`}
      </p>
    </section>
  );
}
