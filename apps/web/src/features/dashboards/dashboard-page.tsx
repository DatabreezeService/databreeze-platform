import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import type { DdaDataImportDashboardPreview } from '@databreeze/contracts/v4';
import type { DdaDashboardWidgetResultsAccepted } from '@databreeze/contracts/v4';

import { useLocale } from '../../app/locale-context.tsx';
import { currentAuthBootstrapV1 } from '../auth/auth-session.ts';
import { workspaceAgentStore } from '../agent/workspace-agent-store.ts';
import type { AgentMessagePresentationV1 } from '../agent/agent-store.ts';
import { AgentInvitation } from './agent-invitation.tsx';
import { analysisLiveConfiguration, proposeAnalysisPlan } from './analysis-api.ts';
import type { AnalysisPlanPreviewV1 } from './analysis-plan-review.tsx';
import type { DashboardChartProposalOptionV1 } from './chart-proposal-picker.tsx';
import {
  DashboardAgentPanel,
  type DashboardAgentResponseV1,
  type DashboardAgentTargetV1,
} from './dashboard-agent-panel.tsx';
import { DashboardCanvas } from './dashboard-canvas.tsx';
import {
  applyDashboardAuthoringCommand,
  DashboardAuthoringApiErrorV1,
  fetchDashboardWorkspaceHistory,
  proposeDashboardCharts,
  type DdaDashboardChartProposal,
} from './dashboard-authoring-api.ts';
import { executeAnalysisWithAgent } from '../analysis/local-analysis-engine.ts';
import { dataImportApi, type DataImportRecordV1 } from '../data/data-import-api.ts';
import { fetchEntitlementSummary, type EntitlementSummaryV1 } from '../usage/entitlement-api.ts';
import { DataDashboardPreviewPage } from './data-dashboard-preview-page.tsx';
import { dashboardPinnedStore } from './dashboard-pinned-store.ts';
import {
  DashboardAuthoringCommandQueueV1,
  type DashboardAuthoringCommandSaveResultV1,
  type DashboardAuthoringQueuedCommandV1,
} from './dashboard-authoring-store.ts';
import {
  createDashboardAuthoringState,
  dashboardAuthoringReducer,
  type DashboardAuthoringViewV1,
} from './dashboard-authoring-reducer.ts';
import {
  dashboardDemoMode,
  dashboardLiveConfiguration,
  fetchDashboardFreshness,
  fetchDashboardDraft,
  fetchDashboardWidgetResults,
  type DashboardDraftFixtureV1,
} from './dashboard-api.ts';

const EMPTY_DASHBOARD: DashboardDraftFixtureV1 = Object.freeze({
  dashboardId: 'empty-dashboard',
  versionId: 'empty-version',
  pages: Object.freeze([
    Object.freeze({
      pageId: 'overview',
      title: Object.freeze({ vi: 'Tổng quan', en: 'Overview' }),
    }),
  ]),
  widgets: Object.freeze([]),
  filters: Object.freeze([]),
  freshness: 'Freshness: not loaded',
  warning: 'Evidence and authorization limits remain visible.',
});

const DEMO_DASHBOARD: DashboardDraftFixtureV1 = Object.freeze({
  dashboardId: '00000000-0000-4000-8000-00000000001b',
  versionId: '00000000-0000-4000-8000-000000000011',
  pages: Object.freeze([
    Object.freeze({
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Tổng quan bán hàng', en: 'Sales overview' }),
    }),
  ]),
  widgets: Object.freeze([
    Object.freeze({
      widgetId: '00000000-0000-4000-8000-00000000001d',
      type: 'KPI',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Doanh thu (YTD)', en: 'Revenue (YTD)' }),
      values: Object.freeze([Object.freeze({ label: 'Doanh thu', value: '$10.67M (₫1,24 tỷ)' })]),
    }),
    Object.freeze({
      widgetId: '00000000-0000-4000-8000-000000000022',
      type: 'KPI',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Đơn hàng', en: 'Orders' }),
      values: Object.freeze([Object.freeze({ label: 'Đơn hàng', value: '19.960' })]),
    }),
    Object.freeze({
      widgetId: '00000000-0000-4000-8000-000000000023',
      type: 'KPI',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Giá trị đơn hàng TB', en: 'Average order value' }),
      values: Object.freeze([Object.freeze({ label: 'Giá trị TB', value: '$534,40' })]),
    }),
    Object.freeze({
      widgetId: '00000000-0000-4000-8000-000000000024',
      type: 'KPI',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Tỷ lệ hoàn thành', en: 'Completion rate' }),
      values: Object.freeze([Object.freeze({ label: 'Hoàn thành', value: '98,4%' })]),
    }),
    Object.freeze({
      widgetId: '00000000-0000-4000-8000-000000000025',
      type: 'LINE',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Doanh thu theo thời gian', en: 'Revenue over time' }),
      values: Object.freeze([]),
    }),
    Object.freeze({
      widgetId: '00000000-0000-4000-8000-000000000026',
      type: 'DONUT',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Cơ cấu doanh thu', en: 'Revenue mix' }),
      values: Object.freeze([]),
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

type DashboardWidgetV1 = DashboardDraftFixtureV1['widgets'][number];
type ApprovedDataPreviewV1 = DdaDataImportDashboardPreview['value'];

function latestReadyImport(
  imports: readonly DataImportRecordV1[] | undefined,
): DataImportRecordV1 | undefined {
  return [...(imports ?? [])]
    .filter((record) => record.state === 'READY' && record.accepted !== undefined)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function formatApprovedPreviewNumber(value: number, locale: 'vi-VN' | 'en'): string {
  return new Intl.NumberFormat(locale === 'vi-VN' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function approvedPreviewAssistantResponse(
  preview: ApprovedDataPreviewV1,
  locale: 'vi-VN' | 'en',
): DashboardAgentResponseV1 {
  const measure = preview.measure;
  const topGroup = [...(preview.dimension?.groups ?? [])].sort(
    (left, right) => (right.total ?? right.count) - (left.total ?? left.count),
  )[0];
  const total =
    measure === undefined ? undefined : formatApprovedPreviewNumber(measure.sum, locale);
  const groupText =
    topGroup === undefined
      ? undefined
      : locale === 'vi-VN'
        ? `Nhóm nổi bật là “${topGroup.label}” với ${formatApprovedPreviewNumber(topGroup.total ?? topGroup.count, locale)}.`
        : `The leading group is “${topGroup.label}” at ${formatApprovedPreviewNumber(topGroup.total ?? topGroup.count, locale)}.`;
  const vi = [
    `Nhận định cục bộ từ bản xem nhanh dữ liệu đã duyệt “${preview.datasetName}”.`,
    measure === undefined
      ? `Bộ dữ liệu có ${preview.rowCount.toLocaleString('vi-VN')} dòng; chưa tìm thấy cột số để tính tổng.`
      : `Tổng cột ${measure.field} là ${total}; trung bình ${formatApprovedPreviewNumber(measure.average, locale)}.`,
    groupText,
    'Đây là bản xem nhanh, chưa phải snapshot chứng nhận. Mở Phân tích để đặt câu hỏi nhiều bước hoặc bật dashboard được cấp quyền.',
  ]
    .filter((line): line is string => line !== undefined)
    .join(' ');
  const en = [
    `Local insight from the approved-data preview “${preview.datasetName}”.`,
    measure === undefined
      ? `The dataset has ${preview.rowCount.toLocaleString('en-US')} rows; no numeric column was found for a total.`
      : `The ${measure.field} total is ${total}; the average is ${formatApprovedPreviewNumber(measure.average, locale)}.`,
    groupText,
    'This is a preview, not a certified snapshot. Open Analysis for multi-step questions or use an authorized dashboard when available.',
  ]
    .filter((line): line is string => line !== undefined)
    .join(' ');
  return {
    kind: 'local-preview',
    message: { vi, en },
  };
}

function verifiedWidgetResults(
  draft: DashboardDraftFixtureV1,
  accepted: DdaDashboardWidgetResultsAccepted | undefined,
  locale: 'vi-VN' | 'en',
): Readonly<Record<string, import('./dashboard-canvas.tsx').DashboardWidgetResultV1>> | undefined {
  if (accepted === undefined) return undefined;
  const byWidgetId = new Map(accepted.widgets.map((widget) => [widget.widgetId, widget]));
  const results: Record<string, import('./dashboard-canvas.tsx').DashboardWidgetResultV1> = {};
  for (const widget of draft.widgets) {
    const verified = byWidgetId.get(widget.widgetId);
    if (verified === undefined) {
      results[widget.widgetId] = {
        rows: [],
        summary:
          locale === 'vi-VN'
            ? 'Chưa có kết quả đã xác minh cho tiện ích này.'
            : 'No verified result is available for this widget.',
        resultState: 'STALE',
      };
      continue;
    }
    results[widget.widgetId] = {
      rows: verified.rows.map((row) => ({
        rowId: row.provenance.resultCellId,
        label: row.label,
        numericValue: row.numericValue,
        displayValue: row.displayValue,
        unit: row.unit,
        provenance: {
          planId: row.provenance.planVersionId,
          metricId: row.provenance.metricVersionId,
          ...(row.provenance.evidenceRefs[0] === undefined
            ? {}
            : { evidenceRef: row.provenance.evidenceRefs[0] }),
        },
      })),
      summary:
        verified.resultState === 'READY'
          ? locale === 'vi-VN'
            ? 'Kết quả đã xác minh từ snapshot gần nhất.'
            : 'Verified result from the latest snapshot.'
          : locale === 'vi-VN'
            ? `Kết quả đã xác minh: ${verified.resultState.toLowerCase()}.`
            : `Verified result: ${verified.resultState.toLowerCase()}.`,
      resultState: verified.resultState,
    };
  }
  return Object.freeze(results);
}

function authoringView(draft: DashboardDraftFixtureV1): DashboardAuthoringViewV1 {
  return Object.freeze({
    dashboardId: draft.dashboardId,
    versionId: draft.versionId,
    revision: draft.revision ?? 1,
  });
}

function failClosedMessage(locale: 'vi-VN' | 'en', errorCode: string | undefined): string {
  if (errorCode === 'DASHBOARD_DRAFT_UNAUTHORIZED') {
    return locale === 'vi-VN'
      ? 'Bạn không có quyền xem bảng điều khiển này.'
      : 'You do not have permission to view this dashboard.';
  }
  if (errorCode === 'DASHBOARD_DRAFT_NOT_FOUND') {
    return locale === 'vi-VN'
      ? 'Chưa có bảng điều khiển trong phạm vi hiện tại.'
      : 'No dashboard exists in the current scope yet.';
  }
  return locale === 'vi-VN'
    ? 'Dữ liệu bảng điều khiển chưa khả dụng. Không có thay đổi nào được gửi.'
    : 'Dashboard data is not available. No changes were sent.';
}

function proposalDetails(
  preview: AnalysisPlanPreviewV1,
  pageId: string,
  question: string,
): DashboardChartProposalOptionV1['details'] {
  return {
    datasets: preview.datasets.map((datasetId) => ({
      datasetId,
      versionId: datasetId,
      label: { vi: 'Tập dữ liệu đã chọn', en: 'Selected dataset' },
    })),
    dimensions: preview.dimensions,
    filters: preview.filters.map((filter) => `${filter.field} ${filter.operator}`),
    dateRange: {
      start: preview.timeRange.start,
      end: preview.timeRange.end,
      grain: preview.timeGrain,
    },
    joins: preview.joins.map((join) =>
      [join.leftField, join.rightField]
        .filter((field): field is string => field !== undefined)
        .join(' → '),
    ),
    units: preview.units,
    assumptions: preview.assumptions,
    outputBounds: preview.output,
    estimatedCost: preview.estimate,
    affectedPageIds: [pageId],
    affectedWidgetIds: [],
    beforeAfterSummary: {
      vi: `Thêm một biểu đồ mới cho yêu cầu: ${question}`,
      en: `Add one new chart for: ${question}`,
    },
  };
}

function chartOptions(
  preview: AnalysisPlanPreviewV1,
  pageId: string,
  question: string,
): readonly DashboardChartProposalOptionV1[] {
  const dimensions = preview.dimensions.map((id) => ({
    id,
    label: { vi: id, en: id },
  }));
  const measureIds = Object.keys(preview.units);
  const measures = measureIds.map((id) => ({ id, label: { vi: id, en: id } }));
  const details = proposalDetails(preview, pageId, question);

  return [
    {
      optionId: 'bar',
      chartType: 'BAR',
      title: { vi: 'So sánh theo nhóm', en: 'Compare by category' },
      rationale: {
        vi: 'Phù hợp để so sánh rõ ràng giữa các nhóm dữ liệu.',
        en: 'Best for clear comparisons across categories.',
      },
      dimensions,
      measures,
      supportedSize: { vi: 'Trung bình hoặc rộng', en: 'Medium or wide' },
      accessibilityDescription: {
        vi: 'Biểu đồ cột có bảng dữ liệu thay thế.',
        en: 'Bar chart with an accessible fallback table.',
      },
      details,
    },
    {
      optionId: 'line',
      chartType: 'LINE',
      title: { vi: 'Xu hướng theo thời gian', en: 'Trend over time' },
      rationale: {
        vi: 'Phù hợp khi dữ liệu có thứ tự thời gian.',
        en: 'Best when the selected data has a time order.',
      },
      dimensions,
      measures,
      supportedSize: { vi: 'Rộng', en: 'Wide' },
      accessibilityDescription: {
        vi: 'Biểu đồ đường có bảng dữ liệu thay thế.',
        en: 'Line chart with an accessible fallback table.',
      },
      details,
    },
    {
      optionId: 'table',
      chartType: 'TABLE',
      title: { vi: 'Bảng chi tiết', en: 'Detailed table' },
      rationale: {
        vi: 'Hiển thị giá trị chính xác và dễ truy vết bằng chứng.',
        en: 'Shows exact values and makes evidence easy to inspect.',
      },
      dimensions,
      measures,
      supportedSize: { vi: 'Trung bình hoặc rộng', en: 'Medium or wide' },
      accessibilityDescription: {
        vi: 'Bảng dữ liệu có tiêu đề hàng và cột rõ ràng.',
        en: 'Data table with explicit row and column labels.',
      },
      details,
    },
  ];
}

function canonicalChartOptions(
  proposal: DdaDashboardChartProposal,
  preview: AnalysisPlanPreviewV1,
  question: string,
): readonly DashboardChartProposalOptionV1[] {
  const details = proposalDetails(preview, proposal.target?.pageId ?? 'overview', question);
  return proposal.options.map((option) => ({
    optionId: option.optionId,
    chartType:
      option.type === 'TEXT_NOTE' || option.type === 'EVIDENCE_NOTE' ? 'TEXT' : option.type,
    title: option.title,
    rationale: option.rationale,
    dimensions: option.dimensions,
    measures: option.measures,
    supportedSize: {
      vi: `Độ rộng ${option.supportedSpans.join(', ')} cột`,
      en: `${option.supportedSpans.join(', ')} column spans`,
    },
    accessibilityDescription: option.accessibilityDescription,
    details: {
      ...details,
      assumptions: option.assumptions,
      estimatedCost: option.estimate,
      affectedPageIds: proposal.target === undefined ? [] : [proposal.target.pageId],
      affectedWidgetIds: proposal.target?.widgetId === undefined ? [] : [proposal.target.widgetId],
      beforeAfterSummary: proposal.summary,
    },
  }));
}

function planLabel(locale: ReturnType<typeof useLocale>, planCode: string): string {
  const family = planCode.replace(/-monthly$/u, '').toLowerCase();
  const labels: Record<string, { readonly vi: string; readonly en: string }> = {
    personal: { vi: 'Cá nhân', en: 'Personal' },
    professional: { vi: 'Professional', en: 'Professional' },
    team: { vi: 'Nhóm', en: 'Team' },
    enterprise: { vi: 'Doanh nghiệp', en: 'Enterprise' },
  };
  const label = labels[family] ?? { vi: planCode, en: planCode };
  return locale === 'vi-VN' ? label.vi : label.en;
}

function entitlementStatusLabel(locale: ReturnType<typeof useLocale>, status: string): string {
  if (status === 'ACTIVE') return locale === 'vi-VN' ? 'Đang hoạt động' : 'Active';
  if (status === 'PAST_DUE') return locale === 'vi-VN' ? 'Cần thanh toán' : 'Payment due';
  return locale === 'vi-VN' ? 'Đang kiểm tra' : 'Checking';
}

/** DDA-020..024/DDA-050: premium canvas with explicit, previewed agent changes. */
export function DashboardPage() {
  const locale = useLocale();
  const location = useLocation();
  const routeDashboardId = new URLSearchParams(location.search).get('dashboard') ?? undefined;
  const pinnedConfiguration = dashboardLiveConfiguration(import.meta.env, routeDashboardId);
  const analysisConfiguration = analysisLiveConfiguration();
  const demoMode = dashboardDemoMode();
  const activeSession = currentAuthBootstrapV1()?.session;
  const activeWorkspaceId =
    activeSession !== undefined && activeSession.scopeType !== 'organization'
      ? activeSession.workspaceId
      : undefined;
  // DDA-020: without an explicitly pinned dashboard, discover the workspace's own
  // authorized dashboard from content-safe history instead of guessing an identifier.
  const discoveryQuery = useQuery({
    queryKey: ['dda', 'dashboard-discovery'],
    queryFn: ({ signal }) => fetchDashboardWorkspaceHistory({ baseUrl: '' }, signal),
    enabled: !demoMode && pinnedConfiguration === undefined,
    retry: false,
  });
  const approvedImportsQuery = useQuery({
    queryKey: ['dda', 'approved-imports', activeWorkspaceId ?? 'organization'],
    queryFn: () => dataImportApi.list(50),
    enabled: !demoMode,
    retry: false,
    staleTime: 30_000,
  });
  const entitlementQuery = useQuery<EntitlementSummaryV1>({
    queryKey: ['bua', 'entitlement-summary', activeWorkspaceId ?? 'organization'],
    queryFn: ({ signal }) => fetchEntitlementSummary({}, signal),
    enabled: !demoMode,
    retry: false,
    staleTime: 30_000,
  });
  const readyImport = latestReadyImport(approvedImportsQuery.data);

  const discoveredDashboardId = discoveryQuery.data?.items.find(
    (item) => item.kind === 'DASHBOARD',
  )?.subjectId;
  const configuration =
    pinnedConfiguration ??
    (discoveredDashboardId === undefined
      ? undefined
      : Object.freeze({ baseUrl: '', dashboardId: discoveredDashboardId }));
  const workspaceDashboardMissing =
    !demoMode &&
    configuration === undefined &&
    !discoveryQuery.isPending &&
    discoveryQuery.error === null;
  const dashboardDiscoveryUnavailable =
    !demoMode &&
    configuration === undefined &&
    !discoveryQuery.isPending &&
    discoveryQuery.error !== null;
  const isDashboardDiscoveryUnavailableState =
    workspaceDashboardMissing || dashboardDiscoveryUnavailable;
  const isEmptyDashboard = isDashboardDiscoveryUnavailableState && readyImport === undefined;
  const approvedPreviewQuery = useQuery({
    queryKey: ['dda', 'data-dashboard-preview', readyImport?.importId],
    queryFn: () => {
      if (readyImport === undefined) throw new Error('DATA_IMPORT_UNAVAILABLE');
      return dataImportApi.dashboardPreview(readyImport.importId);
    },
    // Keep the bounded approved-data preview available even when an authorized
    // dashboard already exists. If the server-side analysis provider is
    // unavailable, the agent can still offer a clearly labelled local insight
    // without inventing a metric or mutating the dashboard.
    enabled: readyImport !== undefined,
    retry: false,
    staleTime: 30_000,
  });
  const dashboardQuery = useQuery({
    queryKey: ['dda', 'dashboard-draft', configuration?.baseUrl, configuration?.dashboardId],
    queryFn: ({ signal }) => {
      if (configuration === undefined) throw new Error('DASHBOARD_CONFIGURATION_UNAVAILABLE');
      return fetchDashboardDraft(configuration, signal);
    },
    enabled: !demoMode && configuration !== undefined,
    retry: false,
  });
  const freshnessQuery = useQuery({
    queryKey: ['dda', 'dashboard-freshness', configuration?.baseUrl, configuration?.dashboardId],
    queryFn: ({ signal }) => {
      if (configuration === undefined) throw new Error('DASHBOARD_CONFIGURATION_UNAVAILABLE');
      return fetchDashboardFreshness(configuration, signal);
    },
    enabled: !demoMode && configuration !== undefined,
    retry: false,
  });
  const resultQuery = useQuery({
    queryKey: [
      'dda',
      'dashboard-result',
      configuration?.baseUrl,
      configuration?.dashboardId,
      freshnessQuery.data?.lastGoodSnapshotId,
    ],
    queryFn: ({ signal }) => {
      if (configuration === undefined || freshnessQuery.data?.lastGoodSnapshotId === undefined) {
        throw new Error('DASHBOARD_RESULT_UNAVAILABLE');
      }
      return fetchDashboardWidgetResults(
        configuration,
        freshnessQuery.data.lastGoodSnapshotId,
        signal,
      );
    },
    enabled:
      !demoMode &&
      configuration !== undefined &&
      freshnessQuery.data?.lastGoodSnapshotId !== undefined,
    retry: false,
  });
  // Do not mount the canvas shell until the authorized draft and its freshness
  // boundary have resolved. In live mode, rendering an empty draft while the
  // snapshot query is still in flight looks like a broken/blank dashboard and
  // can briefly expose fixture-shaped fallbacks before the result arrives.
  const liveSnapshotPending =
    !demoMode &&
    dashboardQuery.data !== undefined &&
    (!freshnessQuery.isFetched ||
      (freshnessQuery.data?.lastGoodSnapshotId !== undefined && !resultQuery.isFetched));
  const liveSnapshotUnavailable =
    !demoMode &&
    dashboardQuery.data !== undefined &&
    freshnessQuery.isFetched &&
    (freshnessQuery.error !== null ||
      freshnessQuery.data?.lastGoodSnapshotId === undefined ||
      resultQuery.error !== null);
  const hasRenderableDashboard =
    demoMode ||
    (dashboardQuery.data !== undefined &&
      !liveSnapshotPending &&
      !liveSnapshotUnavailable &&
      resultQuery.data !== undefined);
  const [agentOpen, setAgentOpen] = useState(false);
  const agentSnapshot = useSyncExternalStore(
    workspaceAgentStore.subscribe,
    workspaceAgentStore.getSnapshot,
    workspaceAgentStore.getSnapshot,
  );
  const [invitationVisible, setInvitationVisible] = useState(true);
  const [agentResponse, setAgentResponse] = useState<DashboardAgentResponseV1>();
  const [canonicalProposal, setCanonicalProposal] = useState<DdaDashboardChartProposal>();
  const [personalFilterValues, setPersonalFilterValues] = useState<
    Readonly<Record<string, string>>
  >({});
  const [acceptedWidgets, setAcceptedWidgets] = useState<readonly DashboardWidgetV1[]>([]);
  const [pendingWidgetFocusId, setPendingWidgetFocusId] = useState<string>();
  const [autosave, setAutosave] = useState<'SAVED' | 'SAVING' | 'FAILED'>('SAVED');
  const [conflictNoticeVisible, setConflictNoticeVisible] = useState(false);
  const [canvasResetToken, setCanvasResetToken] = useState(0);

  const customPinnedWidgets = useSyncExternalStore(
    dashboardPinnedStore.subscribe,
    () => dashboardPinnedStore.getCustomWidgets(),
    () => dashboardPinnedStore.getCustomWidgets(),
  );

  const sourceDraft = demoMode ? DEMO_DASHBOARD : (dashboardQuery.data ?? EMPTY_DASHBOARD);
  const draft = useMemo<DashboardDraftFixtureV1>(() => {
    const freshness = freshnessQuery.data;
    const warning =
      freshness?.freshnessState === 'CURRENT'
        ? locale === 'vi-VN'
          ? 'Đã xác minh bằng snapshot mới nhất từ dữ liệu được duyệt.'
          : 'Verified against the latest snapshot from approved data.'
        : freshnessQuery.error !== null
          ? locale === 'vi-VN'
            ? 'Chưa có snapshot hoàn chỉnh; dữ liệu vẫn được giữ an toàn.'
            : 'No complete snapshot is available; your data remains safe.'
          : sourceDraft.warning;
    const freshnessLabel = freshness
      ? `${freshness.freshnessState} · ${freshness.lastSuccessfulRefreshAt ?? '—'}`
      : sourceDraft.freshness;
    return {
      ...sourceDraft,
      widgets: [...sourceDraft.widgets, ...acceptedWidgets, ...customPinnedWidgets],
      freshness: freshnessLabel,
      warning,
    };
  }, [
    acceptedWidgets,
    customPinnedWidgets,
    freshnessQuery.data,
    freshnessQuery.error,
    locale,
    sourceDraft,
  ]);
  useEffect(() => {
    setPersonalFilterValues({});
  }, [draft.dashboardId, draft.versionId]);
  const liveResults = useMemo(
    () => (demoMode ? undefined : verifiedWidgetResults(draft, resultQuery.data, locale)),
    [demoMode, draft, locale, resultQuery.data],
  );
  useEffect(() => {
    if (pendingWidgetFocusId === undefined) return;
    const frame = globalThis.requestAnimationFrame(() => {
      const widget = globalThis.document.querySelector<HTMLElement>(
        `[data-testid="widget-${pendingWidgetFocusId}"]`,
      );
      widget?.focus();
      setPendingWidgetFocusId(undefined);
    });
    return () => globalThis.cancelAnimationFrame(frame);
  }, [acceptedWidgets, pendingWidgetFocusId]);
  const [authoringState, dispatchAuthoring] = useReducer(dashboardAuthoringReducer, draft, () =>
    createDashboardAuthoringState(authoringView(draft)),
  );
  const page = draft.pages[0] ?? EMPTY_DASHBOARD.pages[0]!;
  const target: DashboardAgentTargetV1 = {
    pageId: page.pageId,
    pageTitle: page.title,
  };
  const errorCode =
    dashboardQuery.error instanceof Error ? dashboardQuery.error.message : undefined;
  const dashboardQueryRef = useRef(dashboardQuery);
  dashboardQueryRef.current = dashboardQuery;
  const authoringContextRef = useRef({ configuration, demoMode, draft });
  authoringContextRef.current = { configuration, demoMode, draft };
  const authoringStateRef = useRef(authoringState);
  authoringStateRef.current = authoringState;
  const proposalRequestRef = useRef<
    | {
        readonly analysisPlanVersionId: string;
        readonly preview: AnalysisPlanPreviewV1;
        readonly question: string;
        readonly targetPageId: string;
      }
    | undefined
  >(undefined);
  const canonicalProposalRef = useRef(canonicalProposal);
  canonicalProposalRef.current = canonicalProposal;
  const dashboardIdentityRef = useRef(draft.dashboardId);

  async function reloadAuthorizedView(): Promise<void> {
    const result = await dashboardQueryRef.current.refetch();
    if (result.error !== null || result.data === undefined) return;
    const safeView = authoringView(result.data);
    commandQueue.reset(safeView);
    dispatchAuthoring({ type: 'AUTHORIZED_VIEW_RELOADED', view: safeView });
  }

  async function saveAuthoringCommand(
    command: DashboardAuthoringQueuedCommandV1,
    view: DashboardAuthoringViewV1,
  ): Promise<DashboardAuthoringCommandSaveResultV1> {
    const current = authoringContextRef.current;
    if (current.demoMode) {
      return {
        commandId: crypto.randomUUID(),
        dashboardId: view.dashboardId,
        versionId: view.versionId,
        revision: view.revision,
        savedAt: new Date().toISOString(),
        publishes: false,
      };
    }
    if (current.configuration === undefined || current.draft.revision === undefined) {
      throw new Error('DASHBOARD_CONFIGURATION_UNAVAILABLE');
    }

    const base = {
      schemaVersion: 3 as const,
      commandId: crypto.randomUUID(),
      dashboardId: view.dashboardId,
      expectedVersionId: view.versionId,
      expectedRevision: view.revision,
      createdAt: new Date().toISOString(),
    };
    if (command.kind === 'SET_LAYOUT') {
      return applyDashboardAuthoringCommand({
        baseUrl: current.configuration.baseUrl,
        command: {
          ...base,
          kind: 'SET_LAYOUT',
          breakpoint: command.layout.breakpoint,
          cells: command.layout.cells,
        },
      });
    }
    if (command.kind === 'ACCEPT_PROPOSAL') {
      const currentProposal = canonicalProposalRef.current;
      let proposalId = command.proposalId;
      let selectedOptionIds = command.selectedOptionIds;
      if (
        currentProposal === undefined ||
        currentProposal.parentVersionId !== view.versionId ||
        currentProposal.expectedRevision !== view.revision
      ) {
        const request = proposalRequestRef.current;
        if (request === undefined) throw new DashboardAuthoringApiErrorV1('INVALID_PROPOSAL');
        const refreshedProposal = await proposeDashboardCharts({
          baseUrl: current.configuration.baseUrl,
          dashboardId: view.dashboardId,
          question: request.question,
          analysisPlanVersionId: request.analysisPlanVersionId,
          targetPageId: request.targetPageId,
          locale: locale === 'vi-VN' ? 'vi' : 'en',
        });
        selectedOptionIds = command.selectedOptionIds.filter((optionId) =>
          refreshedProposal.options.some((option) => option.optionId === optionId),
        );
        canonicalProposalRef.current = refreshedProposal;
        setCanonicalProposal(refreshedProposal);
        setAgentResponse({
          kind: 'proposals',
          proposalId: refreshedProposal.proposalId,
          options: canonicalChartOptions(refreshedProposal, request.preview, request.question),
        });
        dispatchAuthoring({ type: 'PROPOSAL_RECEIVED', proposal: refreshedProposal });
        for (const optionId of selectedOptionIds) {
          dispatchAuthoring({ type: 'OPTION_TOGGLED', optionId });
        }
        if (selectedOptionIds.length !== command.selectedOptionIds.length) {
          throw new DashboardAuthoringApiErrorV1('INVALID_PROPOSAL');
        }
        proposalId = refreshedProposal.proposalId;
      }
      return applyDashboardAuthoringCommand({
        baseUrl: current.configuration.baseUrl,
        command: {
          ...base,
          kind: 'ACCEPT_PROPOSAL',
          proposalId,
          selectedOptionIds,
        },
      });
    }
    return applyDashboardAuthoringCommand({
      baseUrl: current.configuration.baseUrl,
      command: {
        ...base,
        kind: command.kind,
        widgetId: command.widgetId,
      },
    });
  }

  const commandQueue = useMemo(
    () =>
      new DashboardAuthoringCommandQueueV1({
        initialView: authoringView(draft),
        save: saveAuthoringCommand,
        onCommandStarted: (command) => {
          setAutosave('SAVING');
          setConflictNoticeVisible(false);
          dispatchAuthoring({
            type: command.kind === 'ACCEPT_PROPOSAL' ? 'ACCEPT_STARTED' : 'SAVE_STARTED',
          });
        },
        onCommandSucceeded: (command, result) => {
          dispatchAuthoring({
            type: 'SAVE_SUCCEEDED',
            versionId: result.versionId,
            revision: result.revision,
          });
          setAutosave('SAVED');
          void dashboardQueryRef.current.refetch();
          if (command.kind === 'ACCEPT_PROPOSAL') {
            setCanonicalProposal(undefined);
            setAgentResponse(undefined);
            setAgentOpen(false);
          }
        },
        onCommandFailed: (command, error, view) => {
          setAutosave('FAILED');
          if (error instanceof DashboardAuthoringApiErrorV1 && error.code === 'REVISION_CONFLICT') {
            dispatchAuthoring({
              type: 'CONFLICT',
              serverVersionId: error.serverVersionId ?? view.versionId,
            });
            setConflictNoticeVisible(true);
            setCanvasResetToken((current) => current + 1);
            void reloadAuthorizedView();
            return;
          }
          dispatchAuthoring({
            type: 'SAVE_FAILED',
            code: error instanceof DashboardAuthoringApiErrorV1 ? error.code : 'UNAVAILABLE',
          });
          const proposalWasRefreshed =
            error instanceof DashboardAuthoringApiErrorV1 &&
            error.code === 'INVALID_PROPOSAL' &&
            canonicalProposalRef.current !== undefined;
          if (proposalWasRefreshed) {
            const safeView = commandQueue.getCurrentView();
            commandQueue.reset(safeView);
            dispatchAuthoring({ type: 'AUTHORIZED_VIEW_RELOADED', view: safeView });
          }
          if (command.kind === 'ACCEPT_PROPOSAL' && !proposalWasRefreshed) {
            setAgentResponse({ kind: 'error' });
          }
          void dashboardQueryRef.current.refetch();
        },
      }),
    [],
  );

  useEffect(() => () => commandQueue.dispose(), [commandQueue]);

  useEffect(() => {
    const nextView = authoringView(draft);
    const currentView = commandQueue.getCurrentView();
    if (
      nextView.dashboardId !== currentView.dashboardId ||
      nextView.revision > currentView.revision ||
      (nextView.revision === currentView.revision && nextView.versionId !== currentView.versionId)
    ) {
      commandQueue.reset(nextView);
      dispatchAuthoring({ type: 'AUTHORIZED_VIEW_RELOADED', view: nextView });
    }
  }, [commandQueue, draft.dashboardId, draft.revision, draft.versionId]);

  useEffect(() => {
    if (dashboardIdentityRef.current === draft.dashboardId) return;
    dashboardIdentityRef.current = draft.dashboardId;
    setCanonicalProposal(undefined);
    setAgentResponse(undefined);
    setAgentOpen(false);
    setConflictNoticeVisible(false);
  }, [draft.dashboardId]);

  function persistWidgetVisibility(
    kind: 'REMOVE_WIDGET' | 'RESTORE_WIDGET',
    widgetId: string,
  ): void {
    if (demoMode) {
      setAutosave('SAVED');
      return;
    }
    void commandQueue.enqueue({ kind, widgetId }).catch(() => undefined);
  }

  function appendAgentMessage(conversationId: string, message: AgentMessagePresentationV1): void {
    const conversations = workspaceAgentStore.getConversations();
    workspaceAgentStore.setConversations(
      conversations.map((conversation) =>
        conversation.conversationId === conversationId
          ? {
              ...conversation,
              messages: [...(conversation.messages ?? []), message],
            }
          : conversation,
      ),
    );
  }

  function ensureDashboardConversation(question: string): string {
    const active = workspaceAgentStore.getActiveConversation();
    if (active !== undefined) return active.conversationId;
    const conversationId = crypto.randomUUID();
    workspaceAgentStore.setActiveConversation({
      conversationId,
      title: question,
      datasetLabel: locale === 'vi-VN' ? 'Tất cả dữ liệu đã chọn' : 'All selected data',
      datasetVersionLabel: draft.versionId,
      messages: [],
    });
    return conversationId;
  }

  async function localApprovedPreviewResponse(
    question: string,
  ): Promise<DashboardAgentResponseV1 | undefined> {
    if (readyImport === undefined) return undefined;
    let preview = approvedPreviewQuery.data;
    if (preview === undefined && approvedPreviewQuery.isPending) {
      const refreshed = await approvedPreviewQuery.refetch();
      preview = refreshed.data;
    }
    if (preview === undefined) return undefined;
    const conversationId = ensureDashboardConversation(question);
    appendAgentMessage(conversationId, {
      messageId: crypto.randomUUID(),
      role: 'USER',
      text: question,
      createdLabel: locale === 'vi-VN' ? 'Bây giờ' : 'Now',
    });
    const response = approvedPreviewAssistantResponse(preview, locale);
    setAgentResponse(response);
    return recordAgentResponse(conversationId, response);
  }

  function recordAgentResponse(
    conversationId: string,
    response: DashboardAgentResponseV1,
  ): DashboardAgentResponseV1 {
    const message =
      response.kind === 'proposals'
        ? locale === 'vi-VN'
          ? `Tôi đã chuẩn bị ${response.options.length} biểu đồ tương thích. Hãy chọn phương án phù hợp trước khi thêm vào canvas.`
          : `I prepared ${response.options.length} compatible charts. Choose the right options before adding them to the canvas.`
        : (response.message?.[locale === 'vi-VN' ? 'vi' : 'en'] ??
          (locale === 'vi-VN'
            ? 'Tôi chưa thể hoàn tất yêu cầu này. Không có thay đổi nào được gửi.'
            : 'I could not complete this request. No changes were sent.'));
    appendAgentMessage(conversationId, {
      messageId: crypto.randomUUID(),
      role: 'ASSISTANT',
      text: message,
      createdLabel: locale === 'vi-VN' ? 'Bây giờ' : 'Now',
    });
    return response;
  }

  async function askForChart(question: string): Promise<DashboardAgentResponseV1> {
    setAgentResponse(undefined);
    if (!demoMode && configuration === undefined && readyImport !== undefined) {
      const response = await localApprovedPreviewResponse(question);
      if (response !== undefined) return response;
    }
    if (!demoMode && (analysisConfiguration === undefined || configuration === undefined)) {
      const response: DashboardAgentResponseV1 = {
        kind: 'provider-disabled',
        message: {
          vi: 'Trợ lý biểu đồ cần một dashboard và kế hoạch phân tích đã được máy chủ cấp quyền. Hãy mở Dữ liệu hoặc Phân tích để chọn dữ liệu trước.',
          en: 'The chart assistant needs a server-authorized dashboard and analysis plan. Open Data or Analysis to choose data first.',
        },
      };
      setAgentResponse(response);
      return response;
    }

    const conversationId = demoMode ? ensureDashboardConversation(question) : undefined;
    if (conversationId !== undefined) {
      appendAgentMessage(conversationId, {
        messageId: crypto.randomUUID(),
        role: 'USER',
        text: question,
        createdLabel: locale === 'vi-VN' ? 'Bây giờ' : 'Now',
      });
    }

    try {
      const analysis = demoMode
        ? {
            planVersionId: '00000000-0000-4000-8000-000000000041',
            planPreview: {
              datasets: ['demo-sales'],
              semanticVersionId: 'demo-semantic',
              metricVersionId: 'demo-metrics',
              dimensions: ['region'],
              filters: [],
              timeRange: { start: '2026-01-01', end: '2026-12-31' },
              timeGrain: 'MONTH',
              joins: [],
              units: { revenue: 'VND' },
              assumptions: ['Uses the selected governed dataset'],
              output: { form: 'TABLE', maxRows: 100 },
              estimate: { cpuMs: 100, memoryMb: 64 },
            },
          }
        : await proposeAnalysisPlan({
            baseUrl: analysisConfiguration!.baseUrl,
            question,
          });
      const preview = analysis.planPreview;
      if (!demoMode) {
        proposalRequestRef.current = {
          analysisPlanVersionId: analysis.planVersionId,
          preview,
          question,
          targetPageId: page.pageId,
        };
        const proposal = await proposeDashboardCharts({
          baseUrl: configuration!.baseUrl,
          dashboardId: draft.dashboardId,
          question,
          analysisPlanVersionId: analysis.planVersionId,
          targetPageId: page.pageId,
          locale: locale === 'vi-VN' ? 'vi' : 'en',
        });
        setCanonicalProposal(proposal);
        dispatchAuthoring({ type: 'PROPOSAL_RECEIVED', proposal });
        setConflictNoticeVisible(false);
        const response: DashboardAgentResponseV1 = {
          kind: 'proposals',
          proposalId: proposal.proposalId,
          options: canonicalChartOptions(proposal, preview, question),
        };
        setAgentResponse(response);
        return response;
      }
      const response: DashboardAgentResponseV1 = {
        kind: 'proposals',
        proposalId: crypto.randomUUID(),
        options: chartOptions(preview, page.pageId, question),
      };
      setAgentResponse(response);
      return recordAgentResponse(conversationId!, response);
    } catch (error: unknown) {
      if (!demoMode) {
        const providerUnavailable =
          (error instanceof DashboardAuthoringApiErrorV1 && error.code === 'UNAVAILABLE') ||
          (error instanceof Error &&
            error.message !== 'ANALYSIS_PROPOSAL_UNAUTHORIZED' &&
            error.message !== 'ANALYSIS_PROPOSAL_INVALID');
        if (providerUnavailable) {
          const localResponse = await localApprovedPreviewResponse(question);
          if (localResponse !== undefined) return localResponse;
        }
        const response: DashboardAgentResponseV1 = {
          kind: 'error',
          message: {
            vi: 'Không thể tạo đề xuất từ máy chủ. Không có thay đổi nào được gửi.',
            en: 'The server could not create a proposal. No changes were sent.',
          },
        };
        setAgentResponse(response);
        return response;
      }
      const localRes = await executeAnalysisWithAgent(question, undefined, locale);
      const response: DashboardAgentResponseV1 = {
        kind: 'clarification',
        message: {
          vi: localRes.answerText,
          en: localRes.answerText,
        },
      };
      setAgentResponse(response);
      return recordAgentResponse(conversationId!, response);
    }
  }

  async function acceptCharts(selectedOptionIds: readonly string[]) {
    if (agentResponse?.kind !== 'proposals') return;
    if (!demoMode && canonicalProposal !== undefined) {
      const selected = [...selectedOptionIds];
      for (const optionId of selected) {
        if (!authoringStateRef.current.selectedOptionIds.includes(optionId)) {
          dispatchAuthoring({ type: 'OPTION_TOGGLED', optionId });
        }
      }
      setConflictNoticeVisible(false);
      setAutosave('SAVING');
      await commandQueue
        .enqueue({
          kind: 'ACCEPT_PROPOSAL',
          proposalId: canonicalProposal.proposalId,
          selectedOptionIds: selected,
        })
        .catch(() => undefined);
      return;
    }
    const selected = agentResponse.options.filter((option) =>
      selectedOptionIds.includes(option.optionId),
    );
    const nextWidgets = selected.map<DashboardWidgetV1>((option) => {
      const w: DashboardWidgetV1 = {
        widgetId: crypto.randomUUID(),
        pageId: page.pageId,
        type: option.chartType,
        title: option.title,
        values: [],
      };
      dashboardPinnedStore.addWidget(w);
      return w;
    });
    setAcceptedWidgets((current) => [...current, ...nextWidgets]);
    setPendingWidgetFocusId(nextWidgets[0]?.widgetId);
    setAgentResponse(undefined);
    setAutosave('SAVED');
    const activeConversationId = workspaceAgentStore.getActiveConversation()?.conversationId;
    if (activeConversationId !== undefined) {
      appendAgentMessage(activeConversationId, {
        messageId: crypto.randomUUID(),
        role: 'ASSISTANT',
        text:
          locale === 'vi-VN'
            ? `Đã thêm ${nextWidgets.length} biểu đồ vào canvas.`
            : `Added ${nextWidgets.length} ${nextWidgets.length === 1 ? 'chart' : 'charts'} to the canvas.`,
        createdLabel: locale === 'vi-VN' ? 'Bây giờ' : 'Now',
      });
    }
  }

  return (
    <section
      className={`dda-dashboard-page${isEmptyDashboard ? ' dda-dashboard-page--empty' : ''}`}
    >
      <h1 className="sr-only">{locale === 'vi-VN' ? 'Bảng điều khiển' : 'Dashboards'}</h1>
      {!demoMode && dashboardQuery.data === undefined && !isDashboardDiscoveryUnavailableState ? (
        <p className="dda-dashboard-page__notice" role="status">
          {configuration === undefined && discoveryQuery.isPending
            ? locale === 'vi-VN'
              ? 'Đang tìm bảng điều khiển trong không gian làm việc...'
              : 'Finding the workspace dashboard...'
            : dashboardDiscoveryUnavailable
              ? locale === 'vi-VN'
                ? 'Không thể tìm bảng điều khiển trong không gian làm việc lúc này.'
                : 'The workspace dashboard could not be found right now.'
              : failClosedMessage(locale, errorCode)}
        </p>
      ) : null}
      {entitlementQuery.data !== undefined ? (
        <section
          aria-label={locale === 'vi-VN' ? 'Gói và tín dụng AI' : 'Plan and AI credits'}
          className="dda-dashboard-entitlement"
          data-testid="dashboard-entitlement"
        >
          <div className="dda-dashboard-entitlement__plan" data-testid="dashboard-plan">
            <span className="dda-dashboard-entitlement__eyebrow">
              {locale === 'vi-VN' ? 'Gói hiện tại' : 'Current plan'}
            </span>
            <strong>
              {locale === 'vi-VN' ? 'Gói ' : 'Plan '}
              {planLabel(locale, entitlementQuery.data.snapshot.planCode)}
            </strong>
            <span className="dda-dashboard-entitlement__status">
              {entitlementStatusLabel(locale, entitlementQuery.data.snapshot.status)}
            </span>
          </div>
          <div className="dda-dashboard-entitlement__credits" data-testid="dashboard-ai-credits">
            <span className="dda-dashboard-entitlement__eyebrow">
              {locale === 'vi-VN' ? 'Tín dụng AI' : 'AI credits'}
            </span>
            <strong>{entitlementQuery.data.aiCredits.remaining.toLocaleString(locale)}</strong>
            <span>{locale === 'vi-VN' ? 'còn lại trong kỳ này' : 'remaining this cycle'}</span>
          </div>
          <Link className="dda-dashboard-entitlement__upgrade" to={`/${locale}/billing`}>
            {locale === 'vi-VN' ? 'Nâng cấp gói' : 'Upgrade plan'}
          </Link>
        </section>
      ) : null}
      {isEmptyDashboard ? (
        <section className="dda-dashboard-page__empty" data-testid="dashboard-empty-state">
          <img
            alt="DataBreeze"
            className="dda-dashboard-page__empty-logo"
            src="/landing/assets/databreeze-mark.png"
            width="48"
            height="48"
          />
          <p className="dda-dashboard-page__empty-text">
            {locale === 'vi-VN'
              ? 'Tải dữ liệu lên để bắt đầu xây dựng bảng điều khiển của bạn.'
              : 'Upload your data to start building your dashboard.'}
          </p>
          <Link className="dda-dashboard-page__empty-action" to={`/${locale}/data`}>
            {locale === 'vi-VN' ? 'Tải dữ liệu lên' : 'Upload data'}
          </Link>
          {dashboardDiscoveryUnavailable ? (
            <p
              aria-label={
                locale === 'vi-VN'
                  ? 'Không thể tìm bảng điều khiển trong không gian làm việc lúc này.'
                  : 'The workspace dashboard could not be found right now.'
              }
              className="dda-dashboard-page__empty-notice"
              role="alert"
            >
              {locale === 'vi-VN'
                ? 'Không thể tìm bảng điều khiển trong không gian làm việc lúc này.'
                : 'The workspace dashboard could not be found right now.'}
            </p>
          ) : null}
        </section>
      ) : null}
      {isDashboardDiscoveryUnavailableState && readyImport !== undefined ? (
        <section
          aria-label={locale === 'vi-VN' ? 'Dashboard xem nhanh' : 'Dashboard preview'}
          className="dda-dashboard-page__approved-preview"
          data-testid="dashboard-approved-preview"
        >
          <DataDashboardPreviewPage embedded importId={readyImport.importId} />
          <div className="dda-dashboard-page__approved-preview-actions">
            <Link to={`/${locale}/data`}>
              {locale === 'vi-VN' ? 'Quản lý dữ liệu' : 'Manage data'}
            </Link>
            {readyImport.datasetId === undefined ? null : (
              <Link to={`/${locale}/analysis?dataset=${encodeURIComponent(readyImport.datasetId)}`}>
                {locale === 'vi-VN' ? 'Mở Phân tích' : 'Open Analysis'}
              </Link>
            )}
          </div>
        </section>
      ) : null}
      {liveSnapshotPending ? (
        <p className="dda-dashboard-page__notice" role="status">
          {locale === 'vi-VN'
            ? 'Đang tải snapshot đã được cấp quyền để hiển thị số liệu…'
            : 'Loading the authorized snapshot before showing metrics…'}
        </p>
      ) : null}
      {liveSnapshotUnavailable ? (
        <>
          <section
            aria-labelledby="dashboard-snapshot-empty-heading"
            className="dda-dashboard-page__empty dda-dashboard-page__empty--snapshot"
            data-testid="dashboard-snapshot-empty"
          >
            <div className="dda-dashboard-page__empty-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <p className="dda-dashboard-page__empty-eyebrow">
                {locale === 'vi-VN' ? 'Snapshot đầu tiên' : 'First snapshot'}
              </p>
              <h2 id="dashboard-snapshot-empty-heading">
                {locale === 'vi-VN'
                  ? 'Bảng điều khiển đang chờ số liệu đã được xác minh.'
                  : 'Your dashboard is waiting for verified metrics.'}
              </h2>
              <p>
                {locale === 'vi-VN'
                  ? 'Bản nháp đã sẵn sàng, nhưng chưa có snapshot hoàn chỉnh để hiển thị. Hãy duyệt dữ liệu hoặc mở Phân tích; DataBreeze sẽ giữ nguyên màn hình an toàn thay vì hiển thị số liệu chưa xác minh.'
                  : 'The draft is ready, but no complete snapshot is available yet. Approve data or open Analysis; DataBreeze keeps this safe state instead of showing unverified numbers.'}
              </p>
              <div className="dda-dashboard-page__empty-actions">
                <Link to={`/${locale}/data`}>
                  {locale === 'vi-VN' ? 'Mở Dữ liệu' : 'Open Data'}
                </Link>
                <Link to={`/${locale}/analysis`}>
                  {locale === 'vi-VN' ? 'Mở Phân tích' : 'Open Analysis'}
                </Link>
              </div>
            </div>
          </section>
          {readyImport !== undefined ? (
            <section
              aria-label={
                locale === 'vi-VN' ? 'Bản xem nhanh từ dữ liệu đã duyệt' : 'Approved data preview'
              }
              className="dda-dashboard-page__approved-preview dda-dashboard-page__approved-preview--snapshot-fallback"
              data-testid="dashboard-approved-preview-fallback"
            >
              <DataDashboardPreviewPage embedded importId={readyImport.importId} />
              <div className="dda-dashboard-page__approved-preview-actions">
                <Link to={`/${locale}/data`}>
                  {locale === 'vi-VN' ? 'Quản lý dữ liệu' : 'Manage data'}
                </Link>
                {readyImport.datasetId === undefined ? null : (
                  <Link
                    to={`/${locale}/analysis?dataset=${encodeURIComponent(readyImport.datasetId)}`}
                  >
                    {locale === 'vi-VN' ? 'Mở Phân tích' : 'Open Analysis'}
                  </Link>
                )}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
      {conflictNoticeVisible ? (
        <p
          className="dda-dashboard-page__notice"
          data-testid="dashboard-authoring-conflict"
          role="alert"
        >
          {locale === 'vi-VN'
            ? 'Bảng điều khiển đã thay đổi. Đã tải phiên bản an toàn mới nhất. Đề xuất vẫn được giữ lại để bạn xem lại và thử lại.'
            : 'The dashboard changed. The latest safe version is loaded. Your proposal is still available to review and retry.'}
        </p>
      ) : null}
      <span className="sr-only" data-testid="dashboard-freshness">
        {draft.freshness}
      </span>
      <span className="sr-only" data-testid="dashboard-evidence-warning">
        {draft.warning}
      </span>
      {hasRenderableDashboard ? (
        <DashboardCanvas
          key={`${draft.dashboardId}:${draft.versionId}:${canvasResetToken}`}
          locale={locale}
          draft={draft}
          header={{
            title: page.title,
            dataset: { vi: 'Tất cả dữ liệu đã chọn', en: 'All selected data' },
            autosave,
          }}
          onOpenAgent={() => {
            setInvitationVisible(false);
            setAgentOpen(true);
          }}
          onLayoutCommand={(command) => {
            const layout = { breakpoint: command.breakpoint, cells: command.cells };
            dispatchAuthoring({ type: 'LAYOUT_CHANGED', layout });
            setConflictNoticeVisible(false);
            setAutosave('SAVING');
            if (demoMode) return;
            commandQueue.scheduleLayout(layout);
          }}
          onRemoveWidget={(widgetId) => void persistWidgetVisibility('REMOVE_WIDGET', widgetId)}
          onRestoreWidget={(widgetId) => void persistWidgetVisibility('RESTORE_WIDGET', widgetId)}
          filterValues={personalFilterValues}
          onFilterChange={(filterId, value) => {
            setPersonalFilterValues((current) => {
              const trimmed = value.trim();
              if (trimmed.length === 0) {
                const next = { ...current };
                delete next[filterId];
                return next;
              }
              return { ...current, [filterId]: value };
            });
          }}
          {...(liveResults === undefined ? {} : { widgetResults: liveResults })}
          {...(demoMode
            ? {
                layouts: {
                  desktop: [
                    { widgetId: '00000000-0000-4000-8000-00000000001d', x: 0, y: 0, w: 3, h: 3 },
                    { widgetId: '00000000-0000-4000-8000-000000000022', x: 3, y: 0, w: 3, h: 3 },
                    { widgetId: '00000000-0000-4000-8000-000000000023', x: 6, y: 0, w: 3, h: 3 },
                    { widgetId: '00000000-0000-4000-8000-000000000024', x: 9, y: 0, w: 3, h: 3 },
                    { widgetId: '00000000-0000-4000-8000-000000000025', x: 0, y: 3, w: 6, h: 7 },
                    { widgetId: '00000000-0000-4000-8000-000000000026', x: 6, y: 3, w: 6, h: 7 },
                  ],
                  tablet: [],
                  mobile: [],
                },
              }
            : {})}
          {...(demoMode
            ? {
                widgetResults: {
                  '00000000-0000-4000-8000-00000000001d': {
                    rows: [
                      {
                        rowId: 'demo-total-sales',
                        label: 'so với cùng kỳ · +18,4%',
                        numericValue: 10_666_685,
                        displayValue: '$10.67M',
                        unit: 'USD',
                      },
                    ],
                    summary: 'Total revenue from Online Retail data.csv',
                  },
                  '00000000-0000-4000-8000-000000000022': {
                    rows: [
                      {
                        rowId: 'demo-orders',
                        label: 'so với cùng kỳ · +12,3%',
                        numericValue: 19_960,
                        displayValue: '19.960',
                      },
                    ],
                    summary: 'Total unique invoice orders',
                  },
                  '00000000-0000-4000-8000-000000000023': {
                    rows: [
                      {
                        rowId: 'demo-quantity',
                        label: 'so với cùng kỳ · +9,7%',
                        numericValue: 5_588_376,
                        displayValue: '5.588.376',
                      },
                    ],
                    summary: 'Total items sold across all transactions',
                  },
                  '00000000-0000-4000-8000-000000000024': {
                    rows: [
                      {
                        rowId: 'demo-aov',
                        label: 'so với cùng kỳ · +5,5%',
                        numericValue: 534.4,
                        displayValue: '$534,40',
                        unit: 'USD',
                      },
                    ],
                    summary: 'Average order value per transaction',
                  },
                  '00000000-0000-4000-8000-000000000027': {
                    rows: [
                      {
                        rowId: 'c-uk',
                        label: 'UK',
                        numericValue: 9_025_222,
                        displayValue: '$9.03M',
                        unit: 'USD',
                      },
                      {
                        rowId: 'c-nl',
                        label: 'Netherlands',
                        numericValue: 285_446,
                        displayValue: '$285K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'c-ie',
                        label: 'EIRE',
                        numericValue: 283_454,
                        displayValue: '$283K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'c-de',
                        label: 'Germany',
                        numericValue: 228_867,
                        displayValue: '$229K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'c-fr',
                        label: 'France',
                        numericValue: 209_715,
                        displayValue: '$210K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'c-au',
                        label: 'Australia',
                        numericValue: 138_521,
                        displayValue: '$139K',
                        unit: 'USD',
                      },
                    ],
                    summary: 'Revenue breakdown by country',
                  },
                  '00000000-0000-4000-8000-000000000025': {
                    rows: [
                      {
                        rowId: 'm-1',
                        label: 'T12',
                        numericValue: 748_957,
                        displayValue: '$749K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'm-2',
                        label: 'T1',
                        numericValue: 560_000,
                        displayValue: '$560K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'm-3',
                        label: 'T2',
                        numericValue: 498_062,
                        displayValue: '$498K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'm-4',
                        label: 'T3',
                        numericValue: 683_265,
                        displayValue: '$683K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'm-5',
                        label: 'T4',
                        numericValue: 493_207,
                        displayValue: '$493K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'm-6',
                        label: 'T5',
                        numericValue: 723_333,
                        displayValue: '$723K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'm-7',
                        label: 'T6',
                        numericValue: 691_123,
                        displayValue: '$691K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'm-8',
                        label: 'T7',
                        numericValue: 681_300,
                        displayValue: '$681K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'm-9',
                        label: 'T8',
                        numericValue: 682_680,
                        displayValue: '$683K',
                        unit: 'USD',
                      },
                      {
                        rowId: 'm-10',
                        label: 'T9',
                        numericValue: 1_019_687,
                        displayValue: '$1.02M',
                        unit: 'USD',
                      },
                      {
                        rowId: 'm-11',
                        label: 'T10',
                        numericValue: 1_070_704,
                        displayValue: '$1.07M',
                        unit: 'USD',
                      },
                      {
                        rowId: 'm-12',
                        label: 'T11',
                        numericValue: 1_461_756,
                        displayValue: '$1.46M',
                        unit: 'USD',
                      },
                    ],
                    summary: 'Monthly revenue trend',
                  },
                  '00000000-0000-4000-8000-000000000026': {
                    rows: [
                      {
                        rowId: 's-uk',
                        label: 'United Kingdom',
                        numericValue: 84.6,
                        displayValue: '84,6%',
                      },
                      {
                        rowId: 's-nl',
                        label: 'Netherlands',
                        numericValue: 2.7,
                        displayValue: '2,7%',
                      },
                      {
                        rowId: 's-ie',
                        label: 'EIRE (Ireland)',
                        numericValue: 2.7,
                        displayValue: '2,7%',
                      },
                      {
                        rowId: 's-de',
                        label: 'Germany',
                        numericValue: 2.1,
                        displayValue: '2,1%',
                      },
                      {
                        rowId: 's-fr',
                        label: 'France',
                        numericValue: 2.0,
                        displayValue: '2,0%',
                      },
                      {
                        rowId: 's-other',
                        label: 'Khác (Others)',
                        numericValue: 5.9,
                        displayValue: '5,9%',
                      },
                    ],
                    summary: 'Market share breakdown',
                  },
                  '00000000-0000-4000-8000-000000000028': {
                    rows: [
                      {
                        rowId: 'q-1',
                        label: 'Q1',
                        numericValue: 4_210,
                        displayValue: '4.210 đơn',
                      },
                      {
                        rowId: 'q-2',
                        label: 'Q2',
                        numericValue: 4_890,
                        displayValue: '4.890 đơn',
                      },
                      {
                        rowId: 'q-3',
                        label: 'Q3',
                        numericValue: 5_120,
                        displayValue: '5.120 đơn',
                      },
                      {
                        rowId: 'q-4',
                        label: 'Q4',
                        numericValue: 5_740,
                        displayValue: '5.740 đơn',
                      },
                    ],
                    summary: 'Quarterly order volume',
                  },
                  '00000000-0000-4000-8000-000000000029': {
                    rows: [
                      {
                        rowId: 'category-home',
                        label: 'Gia dụng',
                        numericValue: 37.8,
                        displayValue: '37,8%',
                      },
                      {
                        rowId: 'category-gifts',
                        label: 'Quà tặng',
                        numericValue: 26.4,
                        displayValue: '26,4%',
                      },
                      {
                        rowId: 'category-decor',
                        label: 'Trang trí',
                        numericValue: 18.9,
                        displayValue: '18,9%',
                      },
                      {
                        rowId: 'category-accessories',
                        label: 'Phụ kiện',
                        numericValue: 10.7,
                        displayValue: '10,7%',
                      },
                      {
                        rowId: 'category-other',
                        label: 'Khác',
                        numericValue: 6.2,
                        displayValue: '6,2%',
                      },
                    ],
                    summary: 'Revenue contribution by product category',
                  },
                },
              }
            : {})}
        />
      ) : null}
      <AgentInvitation
        expanded={agentOpen}
        locale={locale}
        visible={invitationVisible}
        onOpen={() => {
          setInvitationVisible(false);
          setAgentOpen(true);
        }}
        onDismiss={() => setInvitationVisible(false)}
      />
      <DashboardAgentPanel
        {...(agentSnapshot.activeConversation === undefined
          ? {}
          : {
              activeConversationId: agentSnapshot.activeConversation.conversationId,
              messages: agentSnapshot.activeConversation.messages ?? [],
            })}
        conversations={agentSnapshot.conversations}
        locale={locale}
        open={agentOpen}
        target={target}
        onClose={() => setAgentOpen(false)}
        {...(demoMode
          ? {
              onCreateConversation: () => {
                workspaceAgentStore.setActiveConversation({
                  conversationId: crypto.randomUUID(),
                  title:
                    locale === 'vi-VN'
                      ? 'Hội thoại bảng điều khiển mới'
                      : 'New dashboard conversation',
                  datasetLabel: locale === 'vi-VN' ? 'Tất cả dữ liệu đã chọn' : 'All selected data',
                  datasetVersionLabel: draft.versionId,
                  messages: [],
                });
                setAgentResponse(undefined);
              },
            }
          : {})}
        onSubmitQuestion={askForChart}
        onSelectConversation={(conversationId) => {
          workspaceAgentStore.selectConversation(conversationId);
          setAgentResponse(undefined);
        }}
        onConfirmProposal={acceptCharts}
        confirmingProposal={autosave === 'SAVING' && agentResponse?.kind === 'proposals'}
        {...(agentResponse === undefined ? {} : { response: agentResponse })}
      />
    </section>
  );
}
