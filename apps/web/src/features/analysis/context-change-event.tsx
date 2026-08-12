export function ContextChangeEvent({
  locale,
  fromVersion,
  toVersion,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly fromVersion: string;
  readonly toVersion: string;
}) {
  return (
    <p role="status">
      {locale === 'vi-VN'
        ? `Dữ liệu đã được cập nhật: ${fromVersion} -> ${toVersion}`
        : `Data updated: ${fromVersion} -> ${toVersion}`}
    </p>
  );
}
