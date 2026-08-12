const ACCEPTED = '.csv,.xlsx,.png,.jpg,.jpeg,.pdf';

export function SourceUploadPanel({ locale }: { readonly locale: 'en' | 'vi-VN' }) {
  return (
    <section aria-label={locale === 'vi-VN' ? 'Tải lên nguồn' : 'Source upload'}>
      <p>
        {locale === 'vi-VN'
          ? 'Chấp nhận CSV, XLSX, ảnh và PDF trong giới hạn đã công bố.'
          : 'Accepts published bounded CSV, XLSX, image, and PDF profiles.'}
      </p>
      <input accept={ACCEPTED} type="file" />
    </section>
  );
}
