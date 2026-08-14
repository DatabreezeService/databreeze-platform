import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

import { useLocale } from '../../app/locale-context.tsx';
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
  proposeDashboardCharts,
  type DdaDashboardChartProposal,
} from './dashboard-authoring-api.ts';
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
  fetchDashboardDraft,
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
      values: Object.freeze([Object.freeze({ label: 'Doanh thu', value: '₫1,24 tỷ' })]),
    }),
    Object.freeze({
      widgetId: '00000000-0000-4000-8000-000000000022',
      type: 'KPI',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Đơn hàng', en: 'Orders' }),
      values: Object.freeze([Object.freeze({ label: 'Đơn hàng', value: '3.842' })]),
    }),
    Object.freeze({
      widgetId: '00000000-0000-4000-8000-000000000023',
      type: 'KPI',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Giá trị đơn hàng TB', en: 'Average order value' }),
      values: Object.freeze([Object.freeze({ label: 'Giá trị TB', value: '₫323K' })]),
    }),
    Object.freeze({
      widgetId: '00000000-0000-4000-8000-000000000024',
      type: 'KPI',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Tỷ lệ hoàn thành', en: 'Completion rate' }),
      values: Object.freeze([Object.freeze({ label: 'Hoàn thành', value: '96,4%' })]),
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

/** DDA-020..024/DDA-050: premium canvas with explicit, previewed agent changes. */
export function DashboardPage() {
  const locale = useLocale();
  const location = useLocation();
  const routeDashboardId = new URLSearchParams(location.search).get('dashboard') ?? undefined;
  const configuration = dashboardLiveConfiguration(import.meta.env, routeDashboardId);
  const analysisConfiguration = analysisLiveConfiguration();
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
  const [agentOpen, setAgentOpen] = useState(false);
  const agentSnapshot = useSyncExternalStore(
    workspaceAgentStore.subscribe,
    workspaceAgentStore.getSnapshot,
    workspaceAgentStore.getSnapshot,
  );
  const [invitationVisible, setInvitationVisible] = useState(true);
  const [agentResponse, setAgentResponse] = useState<DashboardAgentResponseV1>();
  const [canonicalProposal, setCanonicalProposal] = useState<DdaDashboardChartProposal>();
  const [acceptedWidgets, setAcceptedWidgets] = useState<readonly DashboardWidgetV1[]>([]);
  const [pendingWidgetFocusId, setPendingWidgetFocusId] = useState<string>();
  const [autosave, setAutosave] = useState<'SAVED' | 'SAVING' | 'FAILED'>('SAVED');
  const [conflictNoticeVisible, setConflictNoticeVisible] = useState(false);
  const [canvasResetToken, setCanvasResetToken] = useState(0);

  const sourceDraft = demoMode ? DEMO_DASHBOARD : (dashboardQuery.data ?? EMPTY_DASHBOARD);
  const draft = useMemo<DashboardDraftFixtureV1>(
    () => ({ ...sourceDraft, widgets: [...sourceDraft.widgets, ...acceptedWidgets] }),
    [acceptedWidgets, sourceDraft],
  );
  useEffect(() => {
    if (pendingWidgetFocusId === undefined) return;
    const frame = globalThis.requestAnimationFrame(() => {
      const widget = globalThis.document.querySelector<HTMLElement>(
        `[data-testid="widget-${pendingWidgetFocusId}"]`,
      );
      if (widget === null) return;
      widget.focus();
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
    const conversationId = ensureDashboardConversation(question);
    appendAgentMessage(conversationId, {
      messageId: crypto.randomUUID(),
      role: 'USER',
      text: question,
      createdLabel: locale === 'vi-VN' ? 'Bây giờ' : 'Now',
    });
    if (!demoMode && (analysisConfiguration === undefined || configuration === undefined)) {
      const response: DashboardAgentResponseV1 = {
        kind: 'provider-disabled',
        message: {
          vi: 'Kết nối phân tích chưa được cấu hình. Dữ liệu và bảng điều khiển hiện tại vẫn an toàn.',
          en: 'Analysis is not configured yet. Your current data and dashboard remain unchanged.',
        },
      };
      setAgentResponse(response);
      return recordAgentResponse(conversationId, response);
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
        return recordAgentResponse(conversationId, response);
      }
      const response: DashboardAgentResponseV1 = {
        kind: 'proposals',
        proposalId: crypto.randomUUID(),
        options: chartOptions(preview, page.pageId, question),
      };
      setAgentResponse(response);
      return recordAgentResponse(conversationId, response);
    } catch {
      const response: DashboardAgentResponseV1 = { kind: 'error' };
      setAgentResponse(response);
      return recordAgentResponse(conversationId, response);
    }
  }

  async function acceptCharts(selectedOptionIds: readonly string[]) {
    if (agentResponse?.kind !== 'proposals') return;
    if (!demoMode) {
      if (canonicalProposal === undefined) {
        setAutosave('FAILED');
        return;
      }
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
    const nextWidgets = selected.map<DashboardWidgetV1>((option) => ({
      widgetId: crypto.randomUUID(),
      pageId: page.pageId,
      type: option.chartType,
      title: option.title,
      values: [],
    }));
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
            : `Added ${nextWidgets.length} charts to the canvas.`,
        createdLabel: locale === 'vi-VN' ? 'Bây giờ' : 'Now',
      });
    }
  }

  return (
    <section className="dda-dashboard-page">
      <h1 className="sr-only">{locale === 'vi-VN' ? 'Bảng điều khiển' : 'Dashboards'}</h1>
      {!demoMode && dashboardQuery.data === undefined ? (
        <p className="dda-dashboard-page__notice" role="status">
          {failClosedMessage(locale, errorCode)}
        </p>
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
        {...(demoMode
          ? {
              layouts: {
                desktop: [
                  { widgetId: '00000000-0000-4000-8000-00000000001d', x: 0, y: 0, w: 3, h: 3 },
                  { widgetId: '00000000-0000-4000-8000-000000000022', x: 3, y: 0, w: 3, h: 3 },
                  { widgetId: '00000000-0000-4000-8000-000000000023', x: 6, y: 0, w: 3, h: 3 },
                  { widgetId: '00000000-0000-4000-8000-000000000024', x: 9, y: 0, w: 3, h: 3 },
                  { widgetId: '00000000-0000-4000-8000-000000000025', x: 0, y: 3, w: 6, h: 6 },
                  { widgetId: '00000000-0000-4000-8000-000000000026', x: 6, y: 3, w: 6, h: 6 },
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
                      label: 'so với cùng kỳ · +12,5%',
                      numericValue: 1_240_000_000,
                      displayValue: '₫1,24 tỷ',
                      unit: 'VND',
                    },
                  ],
                  summary: 'Total sales for the selected governed dataset',
                },
                '00000000-0000-4000-8000-000000000022': {
                  rows: [
                    {
                      rowId: 'demo-orders',
                      label: 'so với cùng kỳ · +8,7%',
                      numericValue: 3_842,
                      displayValue: '3.842',
                    },
                  ],
                  summary: 'Orders for the selected governed dataset',
                },
                '00000000-0000-4000-8000-000000000023': {
                  rows: [
                    {
                      rowId: 'demo-average-order',
                      label: 'so với cùng kỳ · +3,2%',
                      numericValue: 323_000,
                      displayValue: '₫323K',
                      unit: 'VND',
                    },
                  ],
                  summary: 'Average order value for the selected governed dataset',
                },
                '00000000-0000-4000-8000-000000000024': {
                  rows: [
                    {
                      rowId: 'demo-completion-rate',
                      label: 'so với cùng kỳ · +1,1%',
                      numericValue: 96.4,
                      displayValue: '96,4%',
                    },
                  ],
                  summary: 'Completion rate for the selected governed dataset',
                },
                '00000000-0000-4000-8000-000000000025': {
                  rows: [
                    {
                      rowId: 't1',
                      label: 'T1',
                      numericValue: 200_000_000,
                      displayValue: '200M',
                      unit: 'VND',
                    },
                    {
                      rowId: 't2',
                      label: 'T2',
                      numericValue: 330_000_000,
                      displayValue: '330M',
                      unit: 'VND',
                    },
                    {
                      rowId: 't3',
                      label: 'T3',
                      numericValue: 430_000_000,
                      displayValue: '430M',
                      unit: 'VND',
                    },
                    {
                      rowId: 't4',
                      label: 'T4',
                      numericValue: 470_000_000,
                      displayValue: '470M',
                      unit: 'VND',
                    },
                    {
                      rowId: 't5',
                      label: 'T5',
                      numericValue: 690_000_000,
                      displayValue: '690M',
                      unit: 'VND',
                    },
                    {
                      rowId: 't6',
                      label: 'T6',
                      numericValue: 610_000_000,
                      displayValue: '610M',
                      unit: 'VND',
                    },
                  ],
                  summary: 'Revenue over time',
                },
                '00000000-0000-4000-8000-000000000026': {
                  rows: [
                    {
                      rowId: 'south',
                      label: 'Miền Nam',
                      numericValue: 45.6,
                      displayValue: '45,6%',
                    },
                    {
                      rowId: 'north',
                      label: 'Miền Bắc',
                      numericValue: 28.3,
                      displayValue: '28,3%',
                    },
                    {
                      rowId: 'central',
                      label: 'Miền Trung',
                      numericValue: 16.7,
                      displayValue: '16,7%',
                    },
                    {
                      rowId: 'west',
                      label: 'Miền Tây',
                      numericValue: 9.4,
                      displayValue: '9,4%',
                    },
                  ],
                  summary: 'Revenue mix',
                },
              },
            }
          : {})}
      />
      <AgentInvitation
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
