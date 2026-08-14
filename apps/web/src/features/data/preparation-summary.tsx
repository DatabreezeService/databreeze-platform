import { PreparationSummaryPanel } from '../data-intake/preparation-summary-panel.tsx';

import type { DatasetPreparationSummaryV1 } from './data-model.ts';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? { engine: 'Phiên bản xử lý', version: 'Phiên bản bộ dữ liệu' }
    : { engine: 'Engine version', version: 'Dataset version' };
}

export interface PreparationSummaryProps {
  readonly locale: 'en' | 'vi-VN';
  readonly summary: DatasetPreparationSummaryV1;
}

/** DDA-009/010/053: reuse the named-dimension disclosure rather than inventing a quality score. */
export function PreparationSummary({ locale, summary }: PreparationSummaryProps) {
  const text = copy(locale);
  return (
    <section
      aria-label={
        locale === 'vi-VN' ? 'Chuẩn bị và sức khỏe dữ liệu' : 'Data preparation and health'
      }
      className="preparation-summary"
    >
      <PreparationSummaryPanel
        automaticPolicy={summary.automaticPolicy}
        counts={summary.counts}
        healthDimensions={summary.healthDimensions}
        locale={locale === 'vi-VN' ? 'vi' : 'en'}
        mode="FIRST_IMPORT"
        {...(summary.overallSummary === undefined
          ? {}
          : { overallSummary: summary.overallSummary })}
        transformations={summary.transformations}
        warnings={summary.warnings}
      />
      <dl className="preparation-summary__provenance">
        <div>
          <dt>{text.version}</dt>
          <dd>{summary.datasetVersionLabel}</dd>
        </div>
        <div>
          <dt>{text.engine}</dt>
          <dd>{summary.engineVersionLabel}</dd>
        </div>
      </dl>
    </section>
  );
}
