import type { DatasetSourceFileV1 } from './data-model.ts';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        evidence: 'Xem bằng chứng',
        heading: 'Bản gốc được quản trị',
        local: 'Bản gốc này chỉ có thể mở trên thiết bị nguồn đã được cấp quyền.',
        localAction: 'Mở trên thiết bị nguồn',
        safe: 'Mở bản xem an toàn',
        unavailable: 'Bản xem gốc hiện không khả dụng cho tệp này.',
        viewer: 'Bản xem cách ly không thực thi macro, mã hoạt động hoặc làm mới bên ngoài.',
        actionUnavailable: 'Bản xem an toàn chưa được kết nối cho nguồn này.',
        evidenceUnavailable: 'Bằng chứng chưa được kết nối trong màn hình này.',
      }
    : {
        evidence: 'View evidence',
        heading: 'Governed original',
        local: 'This original can only open on its authorized source device.',
        localAction: 'Open on source device',
        safe: 'Open safe viewer',
        unavailable: 'An original view is not available for this file.',
        viewer:
          'The isolated viewer does not execute macros, active content, or external refreshes.',
        actionUnavailable: 'Safe viewing is not connected for this source yet.',
        evidenceUnavailable: 'Evidence is not connected on this surface yet.',
      };
}

export interface OriginalViewerProps {
  readonly kind?: 'CSV' | 'XLSX' | 'IMAGE' | 'PDF';
  readonly locale: 'en' | 'vi-VN';
  readonly onOpenOriginal?: (sourceId: string) => void;
  readonly onViewEvidence?: (sourceId: string) => void;
  readonly source?: DatasetSourceFileV1;
}

/** WEB-006/023/DDA-052: actions are authorization-bound; the Web UI never receives a Local path. */
export function OriginalViewer({
  kind,
  locale,
  onOpenOriginal,
  onViewEvidence,
  source,
}: OriginalViewerProps) {
  const text = copy(locale);
  const sourceType = source?.sourceType ?? kind;
  if (sourceType === undefined) return null;
  const safeToView = source?.originalAction === 'VIEW_SAFE';
  const openOnDevice = source?.originalAction === 'OPEN_ON_SOURCE_DEVICE';
  const unavailable = source?.originalAction === 'NONE';

  return (
    <section aria-label={text.heading} className="original-viewer" role="region">
      <div className="data-section-heading">
        <h2>{text.heading}</h2>
        <span>{sourceType}</span>
      </div>
      <p>{text.viewer}</p>
      {source === undefined ? null : safeToView && onOpenOriginal !== undefined ? (
        <button onClick={() => onOpenOriginal(source.sourceId)} type="button">
          {text.safe}
        </button>
      ) : openOnDevice && onOpenOriginal !== undefined ? (
        <div className="original-viewer__restricted-action">
          <p>{text.local}</p>
          <button onClick={() => onOpenOriginal(source.sourceId)} type="button">
            {text.localAction}
          </button>
        </div>
      ) : safeToView || openOnDevice ? (
        <p className="data-section-empty" role="status">
          {text.actionUnavailable}
        </p>
      ) : unavailable ? (
        <p className="data-section-empty">{text.unavailable}</p>
      ) : null}
      {source?.evidenceAvailable && onViewEvidence !== undefined ? (
        <button
          className="original-viewer__evidence"
          onClick={() => onViewEvidence(source.sourceId)}
          type="button"
        >
          {text.evidence}
        </button>
      ) : source?.evidenceAvailable ? (
        <p className="data-section-empty" role="status">
          {text.evidenceUnavailable}
        </p>
      ) : null}
    </section>
  );
}
