import { useLocale } from '../../app/locale-context.tsx';
import { useQuery } from '@tanstack/react-query';
import { createAgentStore } from '../agent/agent-store.ts';
import { FloatingAgentButton } from '../agent/floating-agent-button.tsx';
import { FloatingAgentPanel } from '../agent/floating-agent-panel.tsx';
import { AnalystPanel } from './analyst-panel.tsx';
import {
  analysisLiveConfiguration,
  proposeAnalysisPlan,
} from './analysis-api.ts';
import { DashboardCanvas } from './dashboard-canvas.tsx';
import { DashboardViewer } from './dashboard-viewer.tsx';
import {
  dashboardDemoMode,
  dashboardLiveConfiguration,
  fetchDashboardDraft,
  publishDashboardSnapshot,
} from './dashboard-api.ts';
import { ExportDialog } from './export-dialog.tsx';
import { PublishDialog } from './publish-dialog.tsx';
import { SnapshotComparison } from './snapshot-comparison.tsx';
import { TemplateDialog } from './template-dialog.tsx';
import type { DashboardDraftFixtureV1 } from './dashboard-api.ts';
import type { AnalysisPlanPreviewV1 } from './analysis-plan-review.tsx';
import { useState } from 'react';
import { tenantLiveConfiguration } from '../session/tenant-live-configuration.ts';

const dashboardAgentStore = createAgentStore();

const FIXTURE_DRAFT: DashboardDraftFixtureV1 = Object.freeze({
  dashboardId: '00000000-0000-4000-8000-00000000001b',
  versionId: '00000000-0000-4000-8000-000000000011',
  pages: Object.freeze([
    Object.freeze({
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Doanh so', en: 'Sales' }),
    }),
  ]),
  widgets: Object.freeze([
    Object.freeze({
      widgetId: '00000000-0000-4000-8000-00000000001d',
      type: 'KPI',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Tong doanh so', en: 'Total sales' }),
      values: Object.freeze([Object.freeze({ label: 'amount', value: '1,250,000 VND' })]),
    }),
  ]),
  filters: Object.freeze([
    Object.freeze({
      filterId: '00000000-0000-4000-8000-00000000001e',
      field: 'region',
      operator: 'IN',
      scope: 'DASHBOARD',
    }),
  ]),
  freshness: 'Freshness: FRESH · last refresh 2026-08-10T10:00:00.000Z',
  warning: 'Evidence and authorization limits remain visible at every breakpoint.',
});

const EMPTY_PLAN_PREVIEW: AnalysisPlanPreviewV1 = Object.freeze({
  datasets: Object.freeze([] as const),
  semanticVersionId: '00000000-0000-4000-8000-000000000000',
  metricVersionId: '00000000-0000-4000-8000-000000000000',
  dimensions: Object.freeze([] as const),
  filters: Object.freeze([] as const),
  timeRange: Object.freeze({
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-12-31T23:59:59.000Z',
  }),
  timeGrain: 'MONTH',
  joins: Object.freeze([] as const),
  units: Object.freeze({} as const),
  assumptions: Object.freeze([
    'Live mode waits for an authorized typed plan; no invented metrics.',
  ] as const),
  output: Object.freeze({ form: 'TABLE', maxRows: 100 }),
  estimate: Object.freeze({ cpuMs: 0, memoryMb: 0 }),
});

const DEMO_PLAN_PREVIEW: AnalysisPlanPreviewV1 = Object.freeze({
  datasets: Object.freeze(['00000000-0000-4000-8000-000000000018']),
  semanticVersionId: '00000000-0000-4000-8000-000000000019',
  metricVersionId: '00000000-0000-4000-8000-00000000001a',
  dimensions: Object.freeze(['region']),
  filters: Object.freeze([Object.freeze({ field: 'year', operator: 'EQ', value: '2026' })]),
  timeRange: Object.freeze({
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-12-31T23:59:59.000Z',
  }),
  timeGrain: 'MONTH',
  joins: Object.freeze([] as const),
  units: Object.freeze({ amount: 'VND' }),
  assumptions: Object.freeze(['Uses accepted sales dataset only']),
  output: Object.freeze({ form: 'TABLE', maxRows: 100 }),
  estimate: Object.freeze({ cpuMs: 100, memoryMb: 64 }),
});

function failClosedMessage(
  locale: 'vi-VN' | 'en',
  demoMode: boolean,
  errorCode: string | undefined,
): string {
  if (demoMode) {
    return locale === 'vi-VN' ? 'Chế độ demo đang bật.' : 'Demo mode is enabled.';
  }
  if (errorCode === 'DASHBOARD_DRAFT_UNAUTHORIZED') {
    return locale === 'vi-VN'
      ? 'Không được phép đọc bản nháp. Quyền và bằng chứng vẫn được giữ nguyên.'
      : 'Draft read is unauthorized. Permissions and evidence remain enforced.';
  }
  if (errorCode === 'DASHBOARD_DRAFT_NOT_FOUND') {
    return locale === 'vi-VN'
      ? 'Không tìm thấy bản nháp trong phạm vi hiện tại.'
      : 'No draft was found in the current scope.';
  }
  return locale === 'vi-VN'
    ? 'Dữ liệu bảng điều khiển chưa khả dụng. Không có thay đổi nào được gửi.'
    : 'Dashboard data is not available. No changes were sent.';
}

/** DDA-020..026/047..049: dashboard authoring page composing analyst + canvas + GA tools. */
export function DashboardPage() {
  const locale = useLocale();
  const configuration = dashboardLiveConfiguration();
  const analysisConfiguration = analysisLiveConfiguration();
  const tenant = tenantLiveConfiguration();
  const demoMode = dashboardDemoMode();
  const dashboardQuery = useQuery({
    queryKey: ['dda', 'dashboard-draft', configuration?.baseUrl, configuration?.dashboardId],
    queryFn: ({ signal }) => {
      if (configuration === undefined) throw new Error('DASHBOARD_CONFIGURATION_UNAVAILABLE');
      return fetchDashboardDraft(configuration, signal);
    },
    enabled: !demoMode && configuration !== undefined,
    retry: false,
  });
  const [publishOpen, setPublishOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [planPreview, setPlanPreview] = useState<AnalysisPlanPreviewV1>(
    demoMode ? DEMO_PLAN_PREVIEW : EMPTY_PLAN_PREVIEW,
  );
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const draft = demoMode ? FIXTURE_DRAFT : dashboardQuery.data;
  const errorCode =
    dashboardQuery.error instanceof Error ? dashboardQuery.error.message : undefined;
  const statusMessage = failClosedMessage(locale, demoMode, errorCode);

  async function onPublish() {
    setPublishStatus(null);
    if (demoMode) {
      setPublishOpen(false);
      setPublishStatus(
        locale === 'vi-VN'
          ? 'Chế độ demo: xuất bản chỉ là mô phỏng cục bộ.'
          : 'Demo mode: publish is a local simulation only.',
      );
      return;
    }
    if (configuration === undefined || draft === undefined || tenant === undefined) {
      setPublishStatus(
        locale === 'vi-VN'
          ? 'Cần bản nháp trực tiếp và ngữ cảnh tenant trước khi xuất bản.'
          : 'A live draft and tenant context are required before publishing.',
      );
      setPublishOpen(false);
      return;
    }
    try {
      await publishDashboardSnapshot({
        baseUrl: configuration.baseUrl,
        dashboardId: draft.dashboardId,
        versionId: draft.versionId,
        audience: 'WORKSPACE_VIEWERS',
        materializationIds: [],
        permissionProjectionVersionId: '00000000-0000-4000-8000-000000000021',
        expectedRevision: 1,
        idempotencyKey: crypto.randomUUID(),
        context: {
          organizationId: tenant.organizationId,
          workspaceId: tenant.workspaceId,
          ...(tenant.projectId === undefined ? {} : { projectId: tenant.projectId }),
        },
      });
      setPublishStatus(
        locale === 'vi-VN' ? 'Yêu cầu xuất bản đã được gửi.' : 'Publish request was submitted.',
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : 'DASHBOARD_PUBLISH_UNAVAILABLE';
      setPublishStatus(
        code === 'DASHBOARD_PUBLISH_UNAUTHORIZED'
          ? locale === 'vi-VN'
            ? 'Không được phép xuất bản. Quyền và bằng chứng vẫn được giữ nguyên.'
            : 'Publish is unauthorized. Permissions and evidence remain enforced.'
          : locale === 'vi-VN'
            ? 'Xuất bản chưa khả dụng. Không có thay đổi nào được gửi.'
            : 'Publish is not available. No changes were sent.',
      );
    } finally {
      setPublishOpen(false);
    }
  }

  async function onPropose(question: string) {
    setAnalysisStatus(null);
    if (demoMode) {
      setPlanPreview(DEMO_PLAN_PREVIEW);
      return;
    }
    if (analysisConfiguration === undefined || question.trim() === '' || tenant === undefined) {
      setAnalysisStatus(
        locale === 'vi-VN'
          ? 'Cần cấu hình API, ngữ cảnh tenant và câu hỏi trước khi đề xuất.'
          : 'API configuration, tenant context, and a question are required before proposing.',
      );
      return;
    }
    try {
      const result = await proposeAnalysisPlan({
        baseUrl: analysisConfiguration.baseUrl,
        question,
        context: {
          organizationId: tenant.organizationId,
          workspaceId: tenant.workspaceId,
          ...(tenant.projectId === undefined ? {} : { projectId: tenant.projectId }),
        },
      });
      setPlanPreview(result.planPreview);
      setAnalysisStatus(null);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'ANALYSIS_PROPOSAL_UNAVAILABLE';
      setAnalysisStatus(
        code === 'ANALYSIS_PROPOSAL_UNAUTHORIZED'
          ? locale === 'vi-VN'
            ? 'Không được phép đề xuất phân tích.'
            : 'Analysis proposal is unauthorized.'
          : locale === 'vi-VN'
            ? 'Đề xuất phân tích chưa khả dụng. Không có thay đổi nào được gửi.'
            : 'Analysis proposal is not available. No changes were sent.',
      );
    }
  }

  return (
    <section className="dda-dashboard-page">
      <h1>{locale === 'vi-VN' ? 'Bảng điều khiển' : 'Dashboards'}</h1>
      <p data-testid="dashboard-freshness">
        {draft?.freshness ??
          (locale === 'vi-VN' ? 'Độ mới: chưa tải' : 'Freshness: not loaded')}
      </p>
      <p data-testid="dashboard-evidence-warning">
        {draft?.warning ??
          (locale === 'vi-VN'
            ? 'Bằng chứng và giới hạn ủy quyền vẫn hiển thị.'
            : 'Evidence and authorization limits remain visible.')}
      </p>
      <div>
        <button type="button" onClick={() => setPublishOpen(true)}>
          {locale === 'vi-VN' ? 'Xuất bản' : 'Publish'}
        </button>
        <button type="button" onClick={() => setTemplateOpen(true)}>
          {locale === 'vi-VN' ? 'Mẫu' : 'Template'}
        </button>
        <button type="button" onClick={() => setExportOpen(true)}>
          {locale === 'vi-VN' ? 'Xuất' : 'Export'}
        </button>
        <button type="button">{locale === 'vi-VN' ? 'Thêm widget' : 'Add widget'}</button>
      </div>
      {draft === undefined ? (
        <p role="status">{statusMessage}</p>
      ) : (
        <DashboardCanvas locale={locale} draft={draft} />
      )}
      {publishStatus !== null ? <p role="status">{publishStatus}</p> : null}
      {analysisStatus !== null ? <p role="status">{analysisStatus}</p> : null}
      <AnalystPanel locale={locale} preview={planPreview} onPropose={(q) => void onPropose(q)} />
      {demoMode ? (
        <>
          <DashboardViewer
            locale={locale}
            permissionExpansionDenied
            rows={[{ region: 'North', amount: '1,250,000' }]}
          />
          <SnapshotComparison
            locale={locale}
            changes={{ amount: { absolute: 50, percentage: 50 } }}
            changedWidgets={['bar-1']}
            changedInputs={['dataset-b']}
          />
        </>
      ) : (
        <DashboardViewer locale={locale} permissionExpansionDenied rows={[]} />
      )}
      <PublishDialog
        locale={locale}
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onPublish={() => void onPublish()}
      />
      <TemplateDialog
        locale={locale}
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSave={() => setTemplateOpen(false)}
      />
      <ExportDialog
        locale={locale}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={() => setExportOpen(false)}
      />
      <FloatingAgentButton locale={locale} store={dashboardAgentStore} />
      <FloatingAgentPanel locale={locale} store={dashboardAgentStore} surface="dashboard" />
    </section>
  );
}
