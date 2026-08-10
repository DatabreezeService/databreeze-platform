import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export interface ExportDialogProps {
  readonly locale: SupportedLocaleV1;
  readonly open: boolean;
  readonly onExport: () => void;
  readonly onClose: () => void;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-049: export dialog for permission-filtered open formats. */
export function ExportDialog({ locale, open, onExport, onClose }: ExportDialogProps) {
  if (!open) return null;
  return (
    <dialog open aria-label={label(locale, 'Xuất dữ liệu', 'Export data')}>
      <h2>{label(locale, 'Xuất đã lọc quyền', 'Permission-filtered export')}</h2>
      <p>
        {label(
          locale,
          'Tải xuống được xác thực lại và không mở rộng quyền nguồn.',
          'Downloads are re-authorized and do not broaden source access.',
        )}
      </p>
      <button type="button" onClick={onExport}>
        {label(locale, 'Xuất CSV/JSON', 'Export CSV/JSON')}
      </button>
      <button type="button" onClick={onClose}>
        {label(locale, 'Đóng', 'Close')}
      </button>
    </dialog>
  );
}
