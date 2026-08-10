import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export interface TemplateDialogProps {
  readonly locale: SupportedLocaleV1;
  readonly open: boolean;
  readonly onSave: () => void;
  readonly onClose: () => void;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-048: template save dialog clarifying no foreign data is embedded. */
export function TemplateDialog({ locale, open, onSave, onClose }: TemplateDialogProps) {
  if (!open) return null;
  return (
    <dialog open aria-label={label(locale, 'Lưu mẫu', 'Save template')}>
      <h2>{label(locale, 'Mẫu trình bày', 'Presentation template')}</h2>
      <p>
        {label(
          locale,
          'Mẫu chỉ lưu bố cục và liên kết, không gồm dữ liệu hay quyền.',
          'Templates store layout and bindings only — never data or permissions.',
        )}
      </p>
      <button type="button" onClick={onSave}>
        {label(locale, 'Lưu mẫu', 'Save template')}
      </button>
      <button type="button" onClick={onClose}>
        {label(locale, 'Đóng', 'Close')}
      </button>
    </dialog>
  );
}
