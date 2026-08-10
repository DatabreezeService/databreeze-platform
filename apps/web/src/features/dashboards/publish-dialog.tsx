import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export interface PublishDialogProps {
  readonly locale: SupportedLocaleV1;
  readonly open: boolean;
  readonly onPublish: () => void;
  readonly onClose: () => void;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-025: explicit publish command separate from draft acceptance. */
export function PublishDialog({ locale, open, onPublish, onClose }: PublishDialogProps) {
  if (!open) return null;
  return (
    <dialog open aria-label={label(locale, 'Xuất bản bảng điều khiển', 'Publish dashboard')}>
      <h2>{label(locale, 'Xuất bản ảnh chụp bất biến', 'Publish immutable snapshot')}</h2>
      <p>
        {label(
          locale,
          'Xuất bản không cấp quyền tập dữ liệu hoặc bằng chứng gốc.',
          'Publishing does not grant dataset or original evidence permissions.',
        )}
      </p>
      <button type="button" onClick={onPublish}>
        {label(locale, 'Xuất bản', 'Publish')}
      </button>
      <button type="button" onClick={onClose}>
        {label(locale, 'Hủy', 'Cancel')}
      </button>
    </dialog>
  );
}
