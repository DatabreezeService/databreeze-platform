import { useLocale } from '../../app/locale-context.tsx';
import { EtlReviewPage } from './etl-review-page.tsx';
import { UploadPanel } from './upload-panel.tsx';

const EMPTY_REVIEW = Object.freeze({
  sourceSchema: Object.freeze(['invoice_id', 'amount', 'region'] as const),
  inferredSchema: Object.freeze(['invoice_id', 'amount', 'region'] as const),
  targetSchema: Object.freeze(['invoice_id', 'amount', 'region'] as const),
  orderedSteps: Object.freeze(['TRIM_TEXT', 'PARSE_NUMBER'] as const),
  assumptions: Object.freeze([
    'Only allowlisted transforms are proposed for review.',
    'AI suggestions are never authoritative.',
  ] as const),
  beforeSample: Object.freeze([] as const),
  afterSample: Object.freeze([] as const),
  counts: Object.freeze({ changed: 0, unchanged: 0, rejected: 0 }),
  exclusions: Object.freeze([] as const),
  unsupportedScopes: Object.freeze([] as const),
  qualityEffects: Object.freeze([
    Object.freeze({
      dimension: 'completeness',
      denominator: 1,
      coverage: 0,
      rule: 'required-fields',
      expectation: 'all-required-present',
      sampleState: 'NONE',
      limitations: Object.freeze(['Awaiting accepted upload']),
    }),
  ] as const),
  evidenceStatus: 'UNAVAILABLE',
  estimatedCost: Object.freeze({ cpuMs: 0, memoryMb: 0 }),
  state: 'AWAITING_UPLOAD',
});

/**
 * DDA-002/005/006 composed Web surface: intake upload then ETL review.
 * Does not invent accepted plans or authoritative numbers.
 */
export function DataPipelinePage() {
  const locale = useLocale();
  const reviewLocale = locale === 'vi-VN' ? 'vi' : 'en';
  return (
    <section aria-label={locale === 'vi-VN' ? 'Tiếp nhận và ETL' : 'Intake and ETL'}>
      <h1>{locale === 'vi-VN' ? 'Tiếp nhận và xem xét ETL' : 'Intake and ETL review'}</h1>
      <p>
        {locale === 'vi-VN'
          ? 'Tải CSV/XLSX được quản trị, rồi xem xét ánh xạ và chất lượng trước khi chấp nhận.'
          : 'Upload governed CSV/XLSX, then review mapping and quality before acceptance.'}
      </p>
      <UploadPanel
        locale={reviewLocale}
        tenantScope={{
          scopeType: 'project',
          organizationId: '00000000-0000-4000-8000-000000000001',
          workspaceId: '00000000-0000-4000-8000-000000000002',
          projectId: '00000000-0000-4000-8000-000000000003',
        }}
        sessionId="00000000-0000-4000-8000-0000000000f1"
      />
      <EtlReviewPage locale={reviewLocale} {...EMPTY_REVIEW} />
      <p>
        <a href={`/${locale}/dashboards`}>
          {locale === 'vi-VN' ? 'Tiếp tục tới bảng điều khiển' : 'Continue to dashboards'}
        </a>
      </p>
    </section>
  );
}
