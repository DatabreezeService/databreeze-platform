import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export interface DashboardAgentLocalizedTextV1 {
  readonly vi: string;
  readonly en: string;
}

export interface DashboardProposalFieldV1 {
  readonly id: string;
  readonly label: DashboardAgentLocalizedTextV1;
}

export type DashboardChartTypeV1 =
  | 'KPI'
  | 'TABLE'
  | 'BAR'
  | 'STACKED_BAR'
  | 'LINE'
  | 'AREA'
  | 'PIE'
  | 'DONUT'
  | 'TEXT';

export interface DashboardProposalDetailsV1 {
  readonly datasets: readonly {
    readonly datasetId: string;
    readonly label: DashboardAgentLocalizedTextV1;
    readonly versionId: string;
  }[];
  readonly dimensions: readonly string[];
  readonly filters: readonly string[];
  readonly dateRange: { readonly start: string; readonly end: string; readonly grain: string };
  readonly joins: readonly string[];
  readonly units: Readonly<Record<string, string>>;
  readonly assumptions: readonly string[];
  readonly outputBounds: { readonly form: string; readonly maxRows: number };
  readonly estimatedCost: { readonly cpuMs: number; readonly memoryMb: number };
  readonly affectedPageIds: readonly string[];
  readonly affectedWidgetIds: readonly string[];
  readonly beforeAfterSummary: DashboardAgentLocalizedTextV1;
}

export interface DashboardChartProposalOptionV1 {
  readonly optionId: string;
  readonly chartType: DashboardChartTypeV1;
  readonly title: DashboardAgentLocalizedTextV1;
  readonly rationale: DashboardAgentLocalizedTextV1;
  readonly dimensions: readonly DashboardProposalFieldV1[];
  readonly measures: readonly DashboardProposalFieldV1[];
  readonly supportedSize: DashboardAgentLocalizedTextV1;
  readonly accessibilityDescription: DashboardAgentLocalizedTextV1;
  readonly details: DashboardProposalDetailsV1;
}

export interface ProposalDetailsProps {
  readonly locale: SupportedLocaleV1;
  readonly details: DashboardProposalDetailsV1;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

function none(locale: SupportedLocaleV1): string {
  return label(locale, 'Không có', 'None');
}

function list(values: readonly string[], locale: SupportedLocaleV1): string {
  return values.length > 0 ? values.join(', ') : none(locale);
}

/** DDA-016/DDA-024: complete governed proposal bindings in an accessible disclosure. */
export function ProposalDetails({ locale, details }: ProposalDetailsProps) {
  return (
    <details className="dda-proposal-details">
      <summary>{label(locale, 'Chi tiết', 'Details')}</summary>
      <dl>
        <div>
          <dt>{label(locale, 'Tập dữ liệu và phiên bản', 'Datasets and versions')}</dt>
          <dd>
            {details.datasets.length > 0
              ? details.datasets
                  .map(
                    (dataset) =>
                      `${dataset.label[locale === 'vi-VN' ? 'vi' : 'en']} (${dataset.datasetId}) · ${dataset.versionId}`,
                  )
                  .join('; ')
              : none(locale)}
          </dd>
        </div>
        <div>
          <dt>{label(locale, 'Chiều', 'Dimensions')}</dt>
          <dd>{list(details.dimensions, locale)}</dd>
        </div>
        <div>
          <dt>{label(locale, 'Bộ lọc', 'Filters')}</dt>
          <dd>{list(details.filters, locale)}</dd>
        </div>
        <div>
          <dt>{label(locale, 'Khoảng thời gian / độ hạt', 'Range / grain')}</dt>
          <dd>
            {details.dateRange.start} → {details.dateRange.end} ({details.dateRange.grain})
          </dd>
        </div>
        <div>
          <dt>{label(locale, 'Đường nối', 'Join paths')}</dt>
          <dd>{list(details.joins, locale)}</dd>
        </div>
        <div>
          <dt>{label(locale, 'Đơn vị', 'Units')}</dt>
          <dd>
            {Object.entries(details.units)
              .map(([field, unit]) => `${field}: ${unit}`)
              .join(', ') || none(locale)}
          </dd>
        </div>
        <div>
          <dt>{label(locale, 'Giả định', 'Assumptions')}</dt>
          <dd>{list(details.assumptions, locale)}</dd>
        </div>
        <div>
          <dt>{label(locale, 'Giới hạn đầu ra', 'Output bounds')}</dt>
          <dd>
            {details.outputBounds.form} / max {details.outputBounds.maxRows}
          </dd>
        </div>
        <div>
          <dt>{label(locale, 'Chi phí ước tính', 'Estimated cost')}</dt>
          <dd>
            {details.estimatedCost.cpuMs} ms CPU, {details.estimatedCost.memoryMb} MB
          </dd>
        </div>
        <div>
          <dt>{label(locale, 'Trang bị ảnh hưởng', 'Affected pages')}</dt>
          <dd>{list(details.affectedPageIds, locale)}</dd>
        </div>
        <div>
          <dt>{label(locale, 'Tiện ích bị ảnh hưởng', 'Affected widgets')}</dt>
          <dd>{list(details.affectedWidgetIds, locale)}</dd>
        </div>
        <div>
          <dt>{label(locale, 'Tóm tắt trước và sau', 'Before and after summary')}</dt>
          <dd>{details.beforeAfterSummary[locale === 'vi-VN' ? 'vi' : 'en']}</dd>
        </div>
      </dl>
    </details>
  );
}
