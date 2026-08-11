import { useState } from 'react';
import { useLocale } from '../../app/locale-context.tsx';
import { useQuery } from '@tanstack/react-query';
import { tenantLiveConfiguration } from '../session/tenant-live-configuration.ts';
import { EtlReviewPage } from './etl-review-page.tsx';
import {
  acceptEtlProposal,
  etlLiveConfiguration,
  fetchEtlProposal,
  type EtlProposalReviewV1,
} from './etl-api.ts';
import { UploadPanel } from './upload-panel.tsx';

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
 * DDA-002/005/006 composed Web surface: intake upload then ETL review/accept.
 * Does not invent accepted plans, hashes, or authoritative numbers.
 */
export function DataPipelinePage() {
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
    enabled: configuration !== undefined,
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
    tenant === undefined
      ? locale === 'vi-VN'
        ? 'Cần ngữ cảnh tenant trước khi tải lên hoặc chấp nhận ETL. Không có thay đổi nào được gửi.'
        : 'Tenant context is required before upload or ETL acceptance. No changes were sent.'
      : null;
  const acceptanceEvidence =
    etlQuery.data !== undefined ? etlQuery.data.acceptanceEvidence : undefined;
  const canAccept =
    tenant !== undefined &&
    configuration !== undefined &&
    acceptanceEvidence !== undefined &&
    etlQuery.data?.state === 'READY_FOR_ACCEPTANCE';

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
        tenantScope: tenant.tenantScope,
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
        locale === 'vi-VN' ? 'Đã gửi yêu cầu chấp nhận ETL.' : 'ETL acceptance request was submitted.',
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
    <section aria-label={locale === 'vi-VN' ? 'Tiếp nhận và ETL' : 'Intake and ETL'}>
      <h1>{locale === 'vi-VN' ? 'Tiếp nhận và xem xét ETL' : 'Intake and ETL review'}</h1>
      <p>
        {locale === 'vi-VN'
          ? 'Tải CSV/XLSX được quản trị, rồi xem xét ánh xạ và chất lượng trước khi chấp nhận.'
          : 'Upload governed CSV/XLSX, then review mapping and quality before acceptance.'}
      </p>
      {tenantMissingMessage !== null ? <p role="status">{tenantMissingMessage}</p> : null}
      {tenant !== undefined ? (
        <UploadPanel
          locale={reviewLocale}
          tenantScope={tenant.tenantScope}
          sessionId={tenant.sessionId}
        />
      ) : null}
      {statusMessage !== null ? <p role="status">{statusMessage}</p> : null}
      <EtlReviewPage locale={reviewLocale} {...review} />
      <button type="button" disabled={!canAccept} onClick={() => void onAccept()}>
        {locale === 'vi-VN' ? 'Chấp nhận đề xuất ETL' : 'Accept ETL proposal'}
      </button>
      {acceptStatus !== null ? <p role="status">{acceptStatus}</p> : null}
      <p>
        <a href={`/${locale}/dashboards`}>
          {locale === 'vi-VN' ? 'Tiếp tục tới bảng điều khiển' : 'Continue to dashboards'}
        </a>
      </p>
    </section>
  );
}
