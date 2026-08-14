const ACCEPTED = '.csv,.xlsx,.png,.jpg,.jpeg,.pdf';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        connect: 'Kết nối nguồn',
        description:
          'Tải CSV, XLSX, ảnh hoặc PDF sau khi máy chủ xác nhận ngữ cảnh và giới hạn áp dụng.',
        heading: 'Thêm nguồn',
        upload: 'Chọn tệp để tải lên',
      }
    : {
        connect: 'Connect source',
        description:
          'Upload CSV, XLSX, images, or PDFs only after the server confirms applicable context and limits.',
        heading: 'Add source',
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
  return (
    <section aria-label={text.heading} className="source-upload-panel">
      <div>
        <h2>{text.heading}</h2>
        <p>{text.description}</p>
      </div>
      <div className="source-upload-panel__actions">
        <label className="source-upload-panel__upload">
          <span>{text.upload}</span>
          <input
            accept={ACCEPTED}
            disabled={onSelectFiles === undefined}
            multiple
            onChange={(event) => {
              if (event.target.files !== null) onSelectFiles?.(event.target.files);
            }}
            type="file"
          />
        </label>
        <button disabled={onConnectSource === undefined} onClick={onConnectSource} type="button">
          {text.connect}
        </button>
      </div>
    </section>
  );
}
