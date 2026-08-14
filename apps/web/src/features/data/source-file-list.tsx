import type { DatasetSourceFileV1 } from './data-model.ts';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? { empty: 'Chưa có tệp nguồn được cấp quyền.', heading: 'Tệp nguồn', open: 'Mở tệp nguồn' }
    : {
        empty: 'No authorized source files are available.',
        heading: 'Source files',
        open: 'Open source file',
      };
}

export interface SourceFileListProps {
  readonly files: readonly DatasetSourceFileV1[];
  readonly locale: 'en' | 'vi-VN';
  readonly onSelectFile?: (sourceId: string) => void;
  readonly selectedSourceId?: string;
}

/** DDA-052: listing exposes safe labels and opaque resource action state only. */
export function SourceFileList({
  files,
  locale,
  onSelectFile,
  selectedSourceId,
}: SourceFileListProps) {
  const text = copy(locale);
  return (
    <section aria-label={text.heading} className="source-file-list">
      <div className="data-section-heading">
        <h2>{text.heading}</h2>
      </div>
      {files.length === 0 ? (
        <p className="data-section-empty">{text.empty}</p>
      ) : (
        <ul>
          {files.map((file) => {
            const selected = file.sourceId === selectedSourceId;
            return (
              <li key={file.sourceId}>
                <button
                  aria-current={selected ? 'true' : undefined}
                  aria-label={`${text.open}: ${file.label}`}
                  className={selected ? 'is-selected' : undefined}
                  onClick={() => onSelectFile?.(file.sourceId)}
                  type="button"
                >
                  <span>
                    <strong>{file.label}</strong>
                    <small>
                      {file.sourceType}
                      {file.versionLabel === undefined ? '' : ` · ${file.versionLabel}`}
                    </small>
                  </span>
                  <span>
                    <small>{file.statusLabel}</small>
                    <small>{file.healthLabel}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
