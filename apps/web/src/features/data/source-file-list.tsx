export function SourceFileList({
  locale,
  files,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly files: readonly { readonly fileId: string; readonly label: string }[];
}) {
  return (
    <section aria-label={locale === 'vi-VN' ? 'Tệp nguồn' : 'Source files'}>
      <ul>
        {files.map((file) => (
          <li key={file.fileId}>{file.label}</li>
        ))}
      </ul>
    </section>
  );
}
