import type { DatasetCardV1 } from './dataset-index-page.tsx';
import { PreparationSummary } from './preparation-summary.tsx';
import { SourceUploadPanel } from './source-upload-panel.tsx';

export function DatasetDetailPage({
  locale,
  dataset,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly dataset: DatasetCardV1;
}) {
  return (
    <main className="dataset-detail-page">
      <h1>{dataset.label}</h1>
      <p>{dataset.versionLabel}</p>
      <SourceUploadPanel locale={locale} />
      <PreparationSummary
        locale={locale}
        summary={{
          safeFixesApplied: 2,
          reviewRequired: 1,
          healthLabel: locale === 'vi-VN' ? 'Sẵn sàng phân tích' : 'Ready for analysis',
        }}
      />
    </main>
  );
}
