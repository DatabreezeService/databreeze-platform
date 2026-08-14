import { useState } from 'react';

import { createWebIntakeApi, type WebIntakeApiV1 } from './intake-api.ts';

export interface UploadPanelCopyV1 {
  readonly title: string;
  readonly chooseFile: string;
  readonly upload: string;
  readonly retry: string;
  readonly cancel: string;
  readonly progress: string;
  readonly success: string;
  readonly failure: string;
}

export const uploadPanelCopyVi: UploadPanelCopyV1 = {
  title: 'Tải tệp CSV/XLSX',
  chooseFile: 'Chọn tệp',
  upload: 'Tải lên',
  retry: 'Thử lại an toàn',
  cancel: 'Hủy',
  progress: 'Đang tải',
  success: 'Đã gửi tệp vào Inbox',
  failure: 'Không thể tải tệp. Không có thay đổi nào được gửi.',
};

export const uploadPanelCopyEn: UploadPanelCopyV1 = {
  title: 'Upload CSV/XLSX',
  chooseFile: 'Choose file',
  upload: 'Upload',
  retry: 'Retry safely',
  cancel: 'Cancel',
  progress: 'Uploading',
  success: 'File added to Inbox',
  failure: 'The file could not upload. No changes were sent.',
};

export interface UploadPanelProps {
  readonly locale?: 'vi' | 'en';
  readonly api?: WebIntakeApiV1;
  readonly sessionId?: string;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = '';
  for (const value of new Uint8Array(bytes)) binary += String.fromCharCode(value);
  return btoa(binary);
}

/** DDA-002 leaf upload panel for plan 083 composition. */
export function UploadPanel({
  locale = 'vi',
  api = createWebIntakeApi(),
  sessionId,
}: UploadPanelProps) {
  const copy = locale === 'en' ? uploadPanelCopyEn : uploadPanelCopyVi;
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'failure' | 'cancelled'>(
    'idle',
  );
  const [artifactVersionId, setArtifactVersionId] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);

  async function runUpload() {
    if (!file) return;
    const abort = new AbortController();
    setController(abort);
    setStatus('uploading');
    setProgress(10);
    try {
      const buffer = await file.arrayBuffer();
      if (abort.signal.aborted) {
        setStatus('cancelled');
        return;
      }
      setProgress(55);
      const expectedSha256 = await sha256Hex(buffer);
      const mediaType = file.name.toLowerCase().endsWith('.xlsx')
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv';
      const result = api.upload
        ? await api.upload({
            fileName: file.name,
            claimedMediaType: mediaType,
            expectedSha256,
            contentBase64: toBase64(buffer),
            idempotencyKey: `web-upload-${crypto.randomUUID()}`,
          })
        : sessionId === undefined
          ? (() => {
              throw new Error('INTAKE_UNAVAILABLE');
            })()
          : await api.finalize({
              sessionId,
              fileName: file.name,
              claimedMediaType: mediaType,
              expectedSha256,
              contentBase64: toBase64(buffer),
            });
      if (abort.signal.aborted) {
        setStatus('cancelled');
        return;
      }
      setProgress(100);
      setArtifactVersionId(result.artifactVersionId);
      setStatus('success');
    } catch {
      setStatus('failure');
    } finally {
      setController(null);
    }
  }

  return (
    <section className="upload-panel" aria-label={copy.title}>
      <h2>{copy.title}</h2>
      <label className="upload-panel__picker">
        {copy.chooseFile}
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setStatus('idle');
            setProgress(0);
            setArtifactVersionId(null);
          }}
        />
      </label>
      <div className="upload-panel__actions">
        <button
          type="button"
          onClick={() => void runUpload()}
          disabled={!file || status === 'uploading'}
        >
          {status === 'failure' ? copy.retry : copy.upload}
        </button>
        <button
          type="button"
          onClick={() => {
            controller?.abort();
            setStatus('cancelled');
          }}
          disabled={status !== 'uploading'}
        >
          {copy.cancel}
        </button>
      </div>
      {status === 'uploading' ? (
        <p className="upload-panel__progress" role="status">
          {copy.progress}: {progress}%
        </p>
      ) : null}
      {status === 'success' && artifactVersionId ? (
        <p className="upload-panel__success" role="status">
          {copy.success}: {artifactVersionId}
        </p>
      ) : null}
      {status === 'failure' ? (
        <p className="upload-panel__failure" role="alert">
          {copy.failure}
        </p>
      ) : null}
    </section>
  );
}
