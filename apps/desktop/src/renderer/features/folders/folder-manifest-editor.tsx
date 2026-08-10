import type { FolderManifestPolicyV1 } from '../../../shared/folder-binding-contract-v1.ts';
import type { DesktopLocale } from '../../../shared/desktop-contract-v1.ts';

const copy = {
  'vi-VN': {
    heading: 'Tuyên bố manifest thư mục',
    purpose: 'Mục đích',
    profiles: 'Hồ sơ tệp được hỗ trợ',
    projection: 'Phân loại chiếu Hybrid',
    debounce: 'Chờ ổn định (ms)',
    confirm: 'Xác nhận chính sách và khả năng thiết bị trước khi lưu',
  },
  en: {
    heading: 'Folder manifest declaration',
    purpose: 'Purpose',
    profiles: 'Supported file profiles',
    projection: 'Hybrid projection class',
    debounce: 'Stability debounce (ms)',
    confirm: 'Confirm device capability and projection policy before saving',
  },
} as const;

export interface FolderManifestEditorProps {
  readonly locale: DesktopLocale;
  readonly manifest: FolderManifestPolicyV1;
  readonly onChange: (manifest: FolderManifestPolicyV1) => void;
}

export function FolderManifestEditor({ locale, manifest, onChange }: FolderManifestEditorProps) {
  const text = copy[locale];
  return (
    <section aria-labelledby="folder-manifest-heading" className="folder-manifest-editor">
      <h2 id="folder-manifest-heading">{text.heading}</h2>
      <p>{text.confirm}</p>
      <dl>
        <div>
          <dt>{text.purpose}</dt>
          <dd>
            <input
              aria-label={text.purpose}
              value={manifest.purpose}
              onChange={(event) => onChange({ ...manifest, purpose: event.target.value })}
            />
          </dd>
        </div>
        <div>
          <dt>{text.profiles}</dt>
          <dd>{manifest.supportedProfiles.join(', ')}</dd>
        </div>
        <div>
          <dt>{text.projection}</dt>
          <dd>{manifest.publicationProjection.class}</dd>
        </div>
        <div>
          <dt>{text.debounce}</dt>
          <dd className="numeric">{manifest.stabilityDebounceMs}</dd>
        </div>
      </dl>
    </section>
  );
}
