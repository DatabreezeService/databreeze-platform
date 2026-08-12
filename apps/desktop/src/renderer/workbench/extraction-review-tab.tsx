import type { DesktopLocale } from '../../shared/desktop-contract-v1.ts';
import type { WorkbenchOriginalDescriptor } from '../../shared/workbench-contract-v1.ts';

export type ExtractionReviewTabProperties = {
  readonly locale: DesktopLocale;
  readonly original: WorkbenchOriginalDescriptor;
  readonly candidate: {
    readonly fields: readonly {
      readonly key: string;
      readonly value: string;
      readonly confidence: number;
    }[];
  };
};

const LABELS = {
  'vi-VN': {
    region: 'Xem lại trích xuất',
    original: 'Bản gốc được giữ',
    candidate: 'Ứng viên trích xuất',
    confidence: 'Độ tin cậy',
  },
  en: {
    region: 'Extraction review',
    original: 'Preserved original',
    candidate: 'Extraction candidate',
    confidence: 'Confidence',
  },
} as const;

export function ExtractionReviewTab({
  locale,
  original,
  candidate,
}: ExtractionReviewTabProperties) {
  const copy = LABELS[locale];

  return (
    <section aria-label={copy.region} className="extraction-review-tab">
      <article className="extraction-review-tab__original">
        <h2>{copy.original}</h2>
        <p>{original.label}</p>
        <p>{original.mediaKind}</p>
      </article>
      <article className="extraction-review-tab__candidate">
        <h2>{copy.candidate}</h2>
        <ul>
          {candidate.fields.map((field) => (
            <li key={field.key}>
              <span>{field.key}</span>
              <span>{field.value}</span>
              <span>
                {copy.confidence}: {(field.confidence * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
