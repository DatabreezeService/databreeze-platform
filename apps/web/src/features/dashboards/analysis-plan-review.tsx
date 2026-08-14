import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export interface AnalysisPlanPreviewV1 {
  readonly datasets: readonly string[];
  readonly semanticVersionId: string;
  readonly metricVersionId: string;
  readonly dimensions: readonly string[];
  readonly filters: readonly {
    readonly field: string;
    readonly operator: string;
    readonly value: string;
  }[];
  readonly timeRange: { readonly start: string; readonly end: string };
  readonly timeGrain: string;
  readonly joins: readonly { readonly leftField?: string; readonly rightField?: string }[];
  readonly units: Readonly<Record<string, string>>;
  readonly assumptions: readonly string[];
  readonly output: { readonly form: string; readonly maxRows: number };
  readonly estimate: { readonly cpuMs: number; readonly memoryMb: number };
}

export interface AnalysisPlanReviewProps {
  readonly locale: SupportedLocaleV1;
  readonly preview: AnalysisPlanPreviewV1;
  readonly presentation?: 'standard' | 'manual-fallback';
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-016: show plan bindings before execution. */
export function AnalysisPlanReview({
  locale,
  preview,
  presentation = 'standard',
}: AnalysisPlanReviewProps) {
  const isManualFallback = presentation === 'manual-fallback';
  return (
    <section
      className={
        isManualFallback
          ? 'dda-analysis-plan-review dda-analysis-plan-review--manual'
          : 'dda-analysis-plan-review'
      }
      aria-label={label(
        locale,
        isManualFallback ? 'Kế hoạch phân tích thủ công' : 'Xem xét kế hoạch phân tích',
        isManualFallback ? 'Manual analysis plan' : 'Analysis plan review',
      )}
    >
      <h2>
        {label(
          locale,
          isManualFallback ? 'Kế hoạch phân tích thủ công' : 'Kế hoạch phân tích',
          isManualFallback ? 'Manual analysis plan' : 'Analysis plan',
        )}
      </h2>
      <dl>
        <div>
          <dt>{label(locale, 'Tập dữ liệu', 'Datasets')}</dt>
          <dd>{preview.datasets.join(', ')}</dd>
        </div>
        <div>
          <dt>{label(locale, 'Phiên bản ngữ nghĩa', 'Semantic version')}</dt>
          <dd>{preview.semanticVersionId}</dd>
        </div>
        <div>
          <dt>{label(locale, 'Phiên bản chỉ số', 'Metric version')}</dt>
          <dd>{preview.metricVersionId}</dd>
        </div>
        <div>
          <dt>{label(locale, 'Chiều', 'Dimensions')}</dt>
          <dd>{preview.dimensions.join(', ')}</dd>
        </div>
        <div>
          <dt>{label(locale, 'Bộ lọc', 'Filters')}</dt>
          <dd>
            {preview.filters
              .map((filter) => `${filter.field} ${filter.operator} ${filter.value}`)
              .join('; ') || label(locale, 'Không có', 'None')}
          </dd>
        </div>
        <div>
          <dt>{label(locale, 'Khoảng thời gian / độ hạt', 'Range / grain')}</dt>
          <dd>
            {preview.timeRange.start} → {preview.timeRange.end} ({preview.timeGrain})
          </dd>
        </div>
        <div>
          <dt>{label(locale, 'Đường nối', 'Join path')}</dt>
          <dd>
            {preview.joins.length === 0
              ? label(locale, 'Không có nối', 'No joins')
              : preview.joins.map((join) => `${join.leftField}=${join.rightField}`).join('; ')}
          </dd>
        </div>
        <div>
          <dt>{label(locale, 'Đơn vị', 'Units')}</dt>
          <dd>
            {Object.entries(preview.units)
              .map(([field, unit]) => `${field}: ${unit}`)
              .join(', ')}
          </dd>
        </div>
        <div>
          <dt>{label(locale, 'Giả định', 'Assumptions')}</dt>
          <dd>{preview.assumptions.join('; ')}</dd>
        </div>
        <div>
          <dt>{label(locale, 'Đầu ra', 'Output')}</dt>
          <dd>
            {preview.output.form} / max {preview.output.maxRows}
          </dd>
        </div>
        <div>
          <dt>{label(locale, 'Chi phí ước tính', 'Estimated cost')}</dt>
          <dd>
            {preview.estimate.cpuMs} ms CPU, {preview.estimate.memoryMb} MB
          </dd>
        </div>
      </dl>
    </section>
  );
}
