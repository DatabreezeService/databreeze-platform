import { useState } from 'react';
import type { DesktopLocale } from '../../shared/desktop-contract-v1.ts';
import type { WorkbenchImportProfile } from '../../shared/workbench-contract-v1.ts';

export type SourceImportDialogProperties = {
  readonly locale: DesktopLocale;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onImport: (input: { profile: WorkbenchImportProfile }) => void;
};

const PROFILES: readonly WorkbenchImportProfile[] = ['CSV', 'XLSX', 'IMAGE', 'PDF'];

const LABELS = {
  'vi-VN': {
    dialog: 'Nhập nguồn',
    continue: 'Tiếp tục nhập',
    close: 'Đóng',
    IMAGE: 'Ảnh',
    PDF: 'PDF',
    CSV: 'CSV',
    XLSX: 'XLSX',
  },
  en: {
    dialog: 'Import source',
    continue: 'Continue import',
    close: 'Close',
    IMAGE: 'Image',
    PDF: 'PDF',
    CSV: 'CSV',
    XLSX: 'XLSX',
  },
} as const;

export function SourceImportDialog({
  locale,
  open,
  onClose,
  onImport,
}: SourceImportDialogProperties) {
  const copy = LABELS[locale];
  const [profile, setProfile] = useState<WorkbenchImportProfile>('CSV');
  if (!open) return null;

  return (
    <div
      aria-label={copy.dialog}
      aria-modal="true"
      className="source-import-dialog"
      role="dialog"
    >
      <fieldset>
        <legend>{copy.dialog}</legend>
        {PROFILES.map((item) => (
          <label key={item}>
            <input
              checked={profile === item}
              name="import-profile"
              onChange={() => setProfile(item)}
              type="radio"
              value={item}
            />
            {copy[item]}
          </label>
        ))}
      </fieldset>
      <div className="source-import-dialog__actions">
        <button onClick={onClose} type="button">
          {copy.close}
        </button>
        <button onClick={() => onImport({ profile })} type="button">
          {copy.continue}
        </button>
      </div>
    </div>
  );
}
