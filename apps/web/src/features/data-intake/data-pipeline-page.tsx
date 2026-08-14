import { useState } from 'react';
import { useLocale } from '../../app/locale-context.tsx';
import { useQuery } from '@tanstack/react-query';
import { dashboardDemoMode } from '../dashboards/dashboard-api.ts';
import { tenantLiveConfiguration } from '../session/tenant-live-configuration.ts';
import { EtlReviewPage } from './etl-review-page.tsx';
import {
  acceptEtlProposal,
  etlAcceptEnabled,
  etlLiveConfiguration,
  fetchEtlProposal,
  type EtlProposalReviewV1,
} from './etl-api.ts';
import { PreparationSummaryPanel } from './preparation-summary-panel.tsx';
import type { WebIntakeApiV1 } from './intake-api.ts';
import { UploadPanel } from './upload-panel.tsx';

const DEMO_INTAKE_API: WebIntakeApiV1 = Object.freeze({
  async upload() {
    return Object.freeze({
      accepted: true,
      sessionId: '00000000-0000-4000-8000-000000000301',
      artifactVersionId: '00000000-0000-4000-8000-000000000302',
      status: 'PENDING_REVIEW',
      profileId: 'dda.web.tabular.v1',
      replayed: false,
    });
  },
  async finalize() {
    return Object.freeze({
      accepted: true,
      sessionId: '00000000-0000-4000-8000-000000000301',
      artifactVersionId: '00000000-0000-4000-8000-000000000302',
      status: 'FINALIZED',
      profileId: 'dda.web.tabular.v1',
    });
  },
});

const EMPTY_REVIEW: Omit<EtlProposalReviewV1, 'proposalId' | 'revision' | 'acceptanceEvidence'> =
  Object.freeze({
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
        numerator: 0,
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
 * DDA-002/005/006/053 composed Web surface: intake upload then ETL review/accept.
 * Does not invent accepted plans, hashes, or authoritative numbers.
 */
export function DataPipelinePage({
  demoMode = dashboardDemoMode(),
}: { readonly demoMode?: boolean } = {}) {
  const locale = useLocale();
  const reviewLocale = locale === 'vi-VN' ? 'vi' : 'en';
  const tenant = tenantLiveConfiguration();
  const configuration = etlLiveConfiguration();
  const etlQuery = useQuery({
    queryKey: ['dda', 'etl-proposal', configuration?.baseUrl, configuration?.proposalId],
    queryFn: ({ signal }) => {
      if (configuration === undefined) throw new Error('ETL_CONFIGURATION_UNAVAILABLE');
      return fetchEtlProposal(configuration, signal);
    },
    enabled: !demoMode && configuration !== undefined,
    retry: false,
  });
  const [acceptStatus, setAcceptStatus] = useState<string | null>(null);
  const review = etlQuery.data ?? EMPTY_REVIEW;
  const errorCode = etlQuery.error instanceof Error ? etlQuery.error.message : undefined;
  const statusMessage =
    errorCode === 'ETL_PROPOSAL_UNAUTHORIZED'
      ? locale === 'vi-VN'
        ? 'Không được phép đọc đề xuất ETL. Quyền và bằng chứng vẫn được giữ nguyên.'
        : 'ETL proposal read is unauthorized. Permissions and evidence remain enforced.'
      : errorCode === undefined
        ? null
        : locale === 'vi-VN'
          ? 'Đề xuất ETL chưa khả dụng. Không có thay đổi nào được gửi.'
          : 'ETL proposal is not available. No changes were sent.';
  const tenantMissingMessage =
    tenant === undefined && !demoMode
      ? locale === 'vi-VN'
        ? 'Cần ngữ cảnh tenant trước khi tải lên hoặc chấp nhận ETL. Không có thay đổi nào được gửi.'
        : 'Tenant context is required before upload or ETL acceptance. No changes were sent.'
      : null;
  const acceptanceEvidence =
    etlQuery.data !== undefined ? etlQuery.data.acceptanceEvidence : undefined;
  const canAccept = etlAcceptEnabled({
    tenantConfigured: tenant !== undefined && !demoMode,
    configuration,
    proposal: etlQuery.data,
  });
  const showFirstImportSummary = etlQuery.data !== undefined && etlQuery.data.state === 'ACCEPTED';

  async function onAccept() {
    setAcceptStatus(null);
    if (
      tenant === undefined ||
      configuration === undefined ||
      acceptanceEvidence === undefined ||
      etlQuery.data === undefined
    ) {
      setAcceptStatus(
        locale === 'vi-VN'
          ? 'Thiếu ngữ cảnh tenant hoặc bằng chứng chấp nhận. Không có thay đổi nào được gửi.'
          : 'Tenant context or acceptance evidence is missing. No changes were sent.',
      );
      return;
    }
    try {
      await acceptEtlProposal({
        baseUrl: configuration.baseUrl,
        proposalId: etlQuery.data.proposalId,
        expectedRevision: acceptanceEvidence.revision,
        idempotencyKey: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        expected: {
          rowCount: acceptanceEvidence.rowCount,
          rejectedCount: acceptanceEvidence.rejectedCount,
          contentHash: acceptanceEvidence.contentHash,
          schemaHash: acceptanceEvidence.schemaHash,
          lineageIds: acceptanceEvidence.lineageIds,
        },
      });
      setAcceptStatus(
        locale === 'vi-VN'
          ? 'Đã gửi yêu cầu chấp nhận ETL.'
          : 'ETL acceptance request was submitted.',
      );
      await etlQuery.refetch();
    } catch (error) {
      const code = error instanceof Error ? error.message : 'ETL_ACCEPT_UNAVAILABLE';
      setAcceptStatus(
        code === 'ETL_ACCEPT_UNAUTHORIZED'
          ? locale === 'vi-VN'
            ? 'Không được phép chấp nhận ETL. Quyền và bằng chứng vẫn được giữ nguyên.'
            : 'ETL acceptance is unauthorized. Permissions and evidence remain enforced.'
          : locale === 'vi-VN'
            ? 'Chấp nhận ETL chưa khả dụng. Không có thay đổi nào được gửi.'
            : 'ETL acceptance is not available. No changes were sent.',
      );
    }
  }

  return (
    <section
      className="data-pipeline-page"
      aria-label={locale === 'vi-VN' ? 'Tiếp nhận và ETL' : 'Intake and ETL'}
    >
      <header className="data-pipeline-page__hero">
        <div>
          <p className="data-pipeline-page__eyebrow">
            {locale === 'vi-VN' ? 'Dữ liệu · Kiểm soát thay đổi' : 'Data · Controlled change'}
          </p>
          <h1>{locale === 'vi-VN' ? 'Tiếp nhận và xem xét ETL' : 'Intake and ETL review'}</h1>
          <p className="data-pipeline-page__intro">
            {locale === 'vi-VN'
              ? 'Tải CSV/XLSX được quản trị, rồi xem xét ánh xạ và chất lượng trước khi chấp nhận.'
              : 'Upload governed CSV/XLSX, then review mapping and quality before acceptance.'}
          </p>
        </div>
        <span className="data-pipeline-page__status-pill">
          {review.state === 'AWAITING_UPLOAD'
            ? locale === 'vi-VN'
              ? 'Đang chờ tệp'
              : 'Awaiting file'
            : review.state}
        </span>
      </header>

      <div className="data-pipeline-page__workspace">
        <div className="data-pipeline-page__main-column">
          {tenantMissingMessage !== null ? (
            <p className="data-pipeline-page__notice" role="status">
              {tenantMissingMessage}
            </p>
          ) : null}
          {tenant !== undefined || demoMode ? (
            <UploadPanel locale={reviewLocale} {...(demoMode ? { api: DEMO_INTAKE_API } : {})} />
          ) : null}
          {statusMessage !== null ? (
            <p className="data-pipeline-page__notice" role="status">
              {statusMessage}
            </p>
          ) : null}
          <EtlReviewPage locale={reviewLocale} {...review} />
          {showFirstImportSummary ? (
            <PreparationSummaryPanel
              locale={reviewLocale}
              mode="FIRST_IMPORT"
              automaticPolicy="SAFE_NON_LOSSY"
              counts={{
                input: review.counts.changed + review.counts.unchanged + review.counts.rejected,
                output: review.counts.changed + review.counts.unchanged,
                unchanged: review.counts.unchanged,
                changed: review.counts.changed,
                rejected: review.counts.rejected,
                quarantined: 0,
                unsupported: 0,
              }}
              transformations={review.orderedSteps}
              warnings={[]}
              healthDimensions={review.qualityEffects}
              overallSummary={{
                formula: 'min(numerator/denominator)',
                coverage: review.qualityEffects[0]?.coverage ?? 0,
                provesFactualCorrectness: false,
              }}
            />
          ) : null}
        </div>

        <aside className="data-pipeline-page__action-card">
          <p className="data-pipeline-page__eyebrow">
            {locale === 'vi-VN' ? 'Bước tiếp theo' : 'Next step'}
          </p>
          <h2>{locale === 'vi-VN' ? 'Giữ quyền kiểm soát' : 'Keep control in your hands'}</h2>
          <p>
            {locale === 'vi-VN'
              ? 'Mọi thay đổi đều cần bằng chứng và quyền phù hợp trước khi ghi nhận.'
              : 'Every change needs the right evidence and permission before it is committed.'}
          </p>
          <button type="button" disabled={!canAccept} onClick={() => void onAccept()}>
            {locale === 'vi-VN' ? 'Chấp nhận đề xuất ETL' : 'Accept ETL proposal'}
          </button>
          {acceptStatus !== null ? (
            <p className="data-pipeline-page__action-status" role="status">
              {acceptStatus}
            </p>
          ) : null}
          <a className="data-pipeline-page__dashboard-link" href={`/${locale}/dashboards`}>
            {locale === 'vi-VN' ? 'Tiếp tục tới bảng điều khiển' : 'Continue to dashboards'}
            <span aria-hidden="true">↗</span>
          </a>
        </aside>
      </div>
    </section>
  );
}
