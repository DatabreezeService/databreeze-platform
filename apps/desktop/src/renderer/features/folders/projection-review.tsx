import type { DesktopLocale } from '../../../shared/desktop-contract-v1.ts';
import type { ProjectionPreview } from '../../../application/publication-projection.service.ts';

const copy = {
  'vi-VN': {
    title: 'Xem trước chiếu Hybrid',
    classify: 'Phân loại',
    fields: 'Trường',
    rows: 'Số hàng',
    bytes: 'Số byte',
    destination: 'Đích',
    evidence: 'Hệ quả bằng chứng',
    policy: 'Chế độ dữ liệu hiệu lực',
    version: 'Phiên bản',
    confirm: 'Chỉ đồng bộ sau khi người dùng xác nhận chiếu này',
  },
  en: {
    title: 'Hybrid projection preview',
    classify: 'Classification',
    fields: 'Fields',
    rows: 'Rows',
    bytes: 'Bytes',
    destination: 'Destination',
    evidence: 'Evidence consequences',
    policy: 'Effective data mode',
    version: 'Version',
    confirm: 'Sync only after the user confirms this projection',
  },
} as const;

export interface ProjectionReviewProps {
  readonly locale: DesktopLocale;
  readonly preview: ProjectionPreview;
  readonly onConfirm: () => void;
}

export function ProjectionReview({ locale, preview, onConfirm }: ProjectionReviewProps) {
  const text = copy[locale];
  return (
    <section aria-labelledby="projection-review-title" className="projection-review">
      <h2 id="projection-review-title">{text.title}</h2>
      <p>{text.confirm}</p>
      <dl>
        <div>
          <dt>{text.classify}</dt>
          <dd>{preview.class}</dd>
        </div>
        <div>
          <dt>{text.fields}</dt>
          <dd>{preview.fieldAllowlist.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt>{text.rows}</dt>
          <dd className="numeric">{preview.rowCount}</dd>
        </div>
        <div>
          <dt>{text.bytes}</dt>
          <dd className="numeric">{preview.byteCount}</dd>
        </div>
        <div>
          <dt>{text.destination}</dt>
          <dd>{preview.destination}</dd>
        </div>
        <div>
          <dt>{text.evidence}</dt>
          <dd>{preview.evidenceConsequences.join(', ')}</dd>
        </div>
        <div>
          <dt>{text.policy}</dt>
          <dd>{preview.effectiveDataMode}</dd>
        </div>
        <div>
          <dt>{text.version}</dt>
          <dd className="numeric">v{preview.version}</dd>
        </div>
      </dl>
      <button type="button" onClick={onConfirm}>
        {text.confirm}
      </button>
    </section>
  );
}
