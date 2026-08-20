import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  upload() {
    return Promise.resolve(
      Object.freeze({
        accepted: true,
        sessionId: '00000000-0000-4000-8000-000000000301',
        artifactVersionId: '00000000-0000-4000-8000-000000000302',
        status: 'PENDING_REVIEW',
        profileId: 'dda.web.tabular.v1',
        replayed: false,
      }),
    );
  },
  finalize() {
    return Promise.resolve(
      Object.freeze({
        accepted: true,
        sessionId: '00000000-0000-4000-8000-000000000301',
        artifactVersionId: '00000000-0000-4000-8000-000000000302',
        status: 'FINALIZED',
        profileId: 'dda.web.tabular.v1',
      }),
    );
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
  // Only the explicit demo surface may use the illustrative review. A live
  // route must wait for an authoritative proposal instead of showing example
  // columns/counts that could be mistaken for the user's data.
  const review = etlQuery.data ?? (demoMode ? EMPTY_REVIEW : undefined);
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
  const summaryReview = etlQuery.data ?? EMPTY_REVIEW;

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
          {review?.state === 'AWAITING_UPLOAD'
            ? locale === 'vi-VN'
              ? 'Đang chờ tệp'
              : 'Awaiting file'
            : (review?.state ??
              (etlQuery.isPending && configuration !== undefined
                ? locale === 'vi-VN'
                  ? 'Đang tải đề xuất'
                  : 'Loading proposal'
                : locale === 'vi-VN'
                  ? 'Chưa có đề xuất'
                  : 'No proposal yet'))}
        </span>
      </header>

      <div className="data-pipeline-page__workspace">
        <div className="data-pipeline-page__main-column">
          {tenantMissingMessage !== null ? (
            <p className="data-pipeline-page__notice" role="status">
              {tenantMissingMessage}
            </p>
          ) : null}
          {demoMode || (tenant !== undefined && configuration !== undefined) ? (
            <UploadPanel locale={reviewLocale} {...(demoMode ? { api: DEMO_INTAKE_API } : {})} />
          ) : null}
          {statusMessage !== null && review !== undefined ? (
            <p className="data-pipeline-page__notice" role="status">
              {statusMessage}
            </p>
          ) : null}
          {!demoMode && configuration === undefined ? (
            <div className="data-pipeline-page__notice data-pipeline-page__notice--action">
              <div>
                <strong>
                  {locale === 'vi-VN'
                    ? 'Dùng Dữ liệu để bắt đầu một lần nạp mới'
                    : 'Use Data to start a new import'}
                </strong>
                <p>
                  {locale === 'vi-VN'
                    ? 'Luồng xem xét ETL cũ cần một proposal ID được cấp quyền. Luồng Dữ liệu mới sẽ lưu trạng thái xem xét trên server và có thể mở lại sau khi tải lại trang.'
                    : 'The legacy ETL review needs an explicitly authorized proposal ID. The Data flow stores server review state and can reopen it after a reload.'}
                </p>
              </div>
              <Link to={`/${locale}/data`}>
                {locale === 'vi-VN' ? 'Mở Dữ liệu' : 'Open Data'} <span aria-hidden="true">↗</span>
              </Link>
            </div>
          ) : null}
          {review !== undefined ? (
            <EtlReviewPage locale={reviewLocale} {...review} />
          ) : (
            <section
              className="data-pipeline-page__review-state"
              role={configuration !== undefined && !etlQuery.isPending ? 'alert' : 'status'}
            >
              <div className="data-pipeline-page__review-state-mark" aria-hidden="true">
                {configuration !== undefined && !etlQuery.isPending ? '!' : '·'}
              </div>
              <div>
                <h2>
                  {configuration === undefined
                    ? locale === 'vi-VN'
                      ? 'Xem xét sẽ xuất hiện sau lần nạp thật đầu tiên'
                      : 'Your review appears after the first real import'
                    : etlQuery.isPending
                      ? locale === 'vi-VN'
                        ? 'Đang tải đề xuất ETL'
                        : 'Loading the ETL proposal'
                      : locale === 'vi-VN'
                        ? 'Chưa thể tải đề xuất ETL'
                        : 'The ETL proposal could not be loaded'}
                </h2>
                <p>
                  {configuration === undefined
                    ? locale === 'vi-VN'
                      ? 'Mở Dữ liệu để tải CSV/XLSX. Sau khi máy chủ tạo bản xem xét, bạn có thể kiểm tra từng thay đổi trước khi chấp nhận.'
                      : 'Open Data to upload a CSV/XLSX. Once the server creates a review, you can inspect each change before accepting it.'
                    : etlQuery.isPending
                      ? locale === 'vi-VN'
                        ? 'Đang lấy bằng chứng và ánh xạ từ máy chủ. Không có dữ liệu mẫu nào được hiển thị.'
                        : 'We are retrieving server evidence and mappings. No sample data is being invented.'
                      : (statusMessage ??
                        (locale === 'vi-VN'
                          ? 'Không có thay đổi nào được gửi. Hãy thử lại sau khi kiểm tra quyền truy cập.'
                          : 'No changes were sent. Try again after checking access.'))}
                </p>
                {configuration === undefined ? (
                  <Link className="data-pipeline-page__review-state-link" to={`/${locale}/data`}>
                    {locale === 'vi-VN' ? 'Mở Dữ liệu' : 'Open Data'}
                    <span aria-hidden="true">↗</span>
                  </Link>
                ) : null}
              </div>
            </section>
          )}
          {showFirstImportSummary ? (
            <PreparationSummaryPanel
              locale={reviewLocale}
              mode="FIRST_IMPORT"
              automaticPolicy="SAFE_NON_LOSSY"
              counts={{
                input:
                  summaryReview.counts.changed +
                  summaryReview.counts.unchanged +
                  summaryReview.counts.rejected,
                output: summaryReview.counts.changed + summaryReview.counts.unchanged,
                unchanged: summaryReview.counts.unchanged,
                changed: summaryReview.counts.changed,
                rejected: summaryReview.counts.rejected,
                quarantined: 0,
                unsupported: 0,
              }}
              transformations={summaryReview.orderedSteps}
              warnings={[]}
              healthDimensions={summaryReview.qualityEffects}
              overallSummary={{
                formula: 'min(numerator/denominator)',
                coverage: summaryReview.qualityEffects[0]?.coverage ?? 0,
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
          {configuration === undefined ? (
            <Link className="data-pipeline-page__primary-link" to={`/${locale}/data`}>
              {locale === 'vi-VN' ? 'Mở Dữ liệu để bắt đầu' : 'Open Data to get started'}
              <span aria-hidden="true">↗</span>
            </Link>
          ) : review === undefined && etlQuery.isPending ? (
            <p className="data-pipeline-page__action-hold" role="status">
              {locale === 'vi-VN' ? 'Đang tải bằng chứng…' : 'Loading server evidence…'}
            </p>
          ) : review === undefined ? (
            <button type="button" onClick={() => void etlQuery.refetch()}>
              {locale === 'vi-VN' ? 'Thử tải lại đề xuất' : 'Retry proposal'}
            </button>
          ) : canAccept ? (
            <button type="button" onClick={() => void onAccept()}>
              {locale === 'vi-VN' ? 'Chấp nhận đề xuất ETL' : 'Accept ETL proposal'}
            </button>
          ) : (
            <p className="data-pipeline-page__action-hold" role="status">
              {locale === 'vi-VN'
                ? 'Đang chờ bằng chứng và quyền máy chủ trước khi chấp nhận.'
                : 'Waiting for server evidence and permission before acceptance.'}
            </p>
          )}
          {acceptStatus !== null ? (
            <p className="data-pipeline-page__action-status" role="status">
              {acceptStatus}
            </p>
          ) : null}
          <Link className="data-pipeline-page__dashboard-link" to={`/${locale}/dashboards`}>
            {locale === 'vi-VN' ? 'Tiếp tục tới bảng điều khiển' : 'Continue to dashboards'}
            <span aria-hidden="true">↗</span>
          </Link>
        </aside>
      </div>
    </section>
  );
}
