const ACCEPTED = '.csv,.xlsx';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        connect: 'Kết nối nguồn',
        description:
          'Thêm CSV hoặc XLSX. Trợ lý sẽ lập hồ sơ an toàn để bạn kiểm tra trước khi duyệt.',
        heading: 'Thêm dữ liệu',
        upload: 'Chọn tệp để tải lên',
      }
    : {
        connect: 'Connect source',
        description:
          'Add CSV or XLSX files. The assistant prepares a review for you before approval.',
        heading: 'Add data',
        upload: 'Choose files to upload',
      };
}

export interface SourceUploadPanelProps {
  readonly locale: 'en' | 'vi-VN';
  readonly onConnectSource?: () => void;
  readonly onSelectFiles?: (files: FileList) => void;
}

/** WEB-005/DDA-002: only a caller with an authorized intake command may receive selected bytes. */
export function SourceUploadPanel({
  locale,
  onConnectSource,
  onSelectFiles,
}: SourceUploadPanelProps) {
  const text = copy(locale);
  const canUpload = onSelectFiles !== undefined;
  const canConnect = onConnectSource !== undefined;

  // Do not render a dead-looking panel when the current authorized route has
  // no intake command. An unavailable action is represented by the parent
  // page's honest status copy, never by a disabled premium-looking button.
  if (!canUpload && !canConnect) return null;

  return (
    <section aria-label={text.heading} className="source-upload-panel">
      <div>
        <h2>{text.heading}</h2>
        <p>{text.description}</p>
      </div>
      <div className="source-upload-panel__actions">
        {canUpload ? (
          <label className="source-upload-panel__upload">
            <span>{text.upload}</span>
            <input
              aria-label={locale === 'vi-VN' ? 'Chọn tệp để tải lên' : 'Choose files to upload'}
              accept={ACCEPTED}
              multiple
              onChange={(event) => {
                if (event.target.files !== null) onSelectFiles?.(event.target.files);
              }}
              type="file"
            />
          </label>
        ) : null}
        {canConnect ? (
          <button onClick={onConnectSource} type="button">
            {text.connect}
          </button>
        ) : null}
      </div>
    </section>
  );
}
