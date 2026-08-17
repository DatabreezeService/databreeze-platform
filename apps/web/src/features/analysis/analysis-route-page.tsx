import type {
  ContextEvent,
  DdaConversationLoadAccepted,
  DdaConversationSummary,
} from '@databreeze/contracts/v4';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import { workspaceAgentStore } from '../agent/workspace-agent-store.ts';
import { dataApiBaseConfiguration, fetchAuthorizedDataIndex } from '../data/data-api.ts';
import { localDataStore } from '../data/local-data-store.ts';
import { dashboardDemoMode } from '../dashboards/dashboard-api.ts';
import {
  AnalysisConversationApiError,
  analysisConversationApiConfiguration,
  createAuthorizedConversation,
  fetchAuthorizedConversation,
  fetchAuthorizedConversationHistory,
  runAuthorizedAgentTurn,
} from './analysis-api.ts';
import type {
  AnalysisContextChangeEventV1,
  AnalysisConversationV1,
  AnalysisDatasetContextV1,
  AnalysisTurnErrorV1,
} from './analysis-model.ts';
import { AnalysisPage } from './analysis-page.tsx';
import {
  executeAnalysisWithAgent,
  executeLocalAnalysis,
  type LocalAnalysisChartProposal,
} from './local-analysis-engine.ts';

const AUTHORIZED_WORKSPACE_CACHE_SCOPE = 'authorized-current-workspace';

const INITIAL_DEMO_CONVERSATIONS: readonly AnalysisConversationV1[] = Object.freeze([
  Object.freeze({
    conversationId: 'demo-revenue-analysis',
    title: 'Doanh thu theo quốc gia',
    updatedLabel: 'Hôm nay, 10:24',
    datasetId: '00000000-0000-4000-8000-000000000051',
    datasetContext: Object.freeze([
      Object.freeze({
        datasetLabel: 'Bán lẻ Trực tuyến (data.csv)',
        datasetVersionLabel: 'Phiên bản 1',
        datasetId: '00000000-0000-4000-8000-000000000051',
      }),
    ]),
    messages: Object.freeze([
      Object.freeze({
        messageId: 'demo-message-1',
        role: 'USER' as const,
        text: 'Thị trường nào đang đóng góp doanh thu lớn nhất?',
        createdLabel: '10:22',
      }),
      Object.freeze({
        messageId: 'demo-message-2',
        role: 'AGENT' as const,
        text: 'Dựa trên dữ liệu **Bán lẻ Trực tuyến (data.csv)** (541.910 dòng):\n\n- **United Kingdom** dẫn đầu với **$9.03M** (chiếm 84.6% tổng doanh thu).\n- **Netherlands**: $285K\n- **EIRE**: $283K\n- **Germany**: $229K\n- **France**: $210K\n\nTổng doanh thu toàn cầu đạt **$10.67M**. Tôi đã tạo biểu đồ cột tương ứng, bạn có thể ghim vào Bảng điều khiển.',
        createdLabel: '10:24',
        chartProposal: {
          optionId: 'proposal-demo-1',
          type: 'BAR' as const,
          title: 'Doanh thu theo Quốc gia',
          summary: 'So sánh doanh thu giữa các thị trường trọng điểm',
          dataPoints: [
            { label: 'UK', value: 9025222, formatted: '$9.03M' },
            { label: 'Netherlands', value: 285446, formatted: '$285K' },
            { label: 'EIRE', value: 283454, formatted: '$283K' },
            { label: 'Germany', value: 228867, formatted: '$229K' },
            { label: 'France', value: 209715, formatted: '$210K' },
          ],
          aggregateValue: '$10.67M',
        },
      }),
    ]),
  }),
]);

function shortOpaqueId(value: string): string {
  return `…${value.slice(-8)}`;
}

function datasetContext(
  summary: DdaConversationSummary,
  locale: 'en' | 'vi-VN',
): readonly AnalysisDatasetContextV1[] {
  return summary.datasets.map((binding) =>
    Object.freeze({
      datasetId: binding.datasetId,
      datasetLabel:
        locale === 'vi-VN'
          ? `Bộ dữ liệu ${shortOpaqueId(binding.datasetId)}`
          : `Dataset ${shortOpaqueId(binding.datasetId)}`,
      datasetVersionLabel:
        locale === 'vi-VN'
          ? `Phiên bản ${shortOpaqueId(binding.datasetVersionId)}`
          : `Version ${shortOpaqueId(binding.datasetVersionId)}`,
    }),
  );
}

function dateLabel(value: string, locale: 'en' | 'vi-VN'): string | undefined {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return undefined;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

function summaryPresentation(
  summary: DdaConversationSummary,
  locale: 'en' | 'vi-VN',
): AnalysisConversationV1 {
  const updatedLabel = dateLabel(summary.updatedAt, locale);
  return Object.freeze({
    conversationId: summary.conversationId,
    title: summary.title,
    datasetContext: Object.freeze(datasetContext(summary, locale)),
    messages: Object.freeze([]),
    ...(updatedLabel === undefined ? {} : { updatedLabel }),
  });
}

function loadedConversationPresentation(
  page: DdaConversationLoadAccepted,
  locale: 'en' | 'vi-VN',
): AnalysisConversationV1 {
  return Object.freeze({
    ...summaryPresentation(page.conversation, locale),
    messages: Object.freeze(
      page.messages.map((message) => {
        const createdLabel = dateLabel(message.createdAt, locale);
        return Object.freeze({
          messageId: message.messageId,
          role: message.role,
          text: message.text,
          ...(createdLabel === undefined ? {} : { createdLabel }),
        });
      }),
    ),
  });
}

function versionLabel(value: string | undefined, locale: 'en' | 'vi-VN'): string | undefined {
  if (value === undefined) return undefined;
  return locale === 'vi-VN'
    ? `Phiên bản ${shortOpaqueId(value)}`
    : `Version ${shortOpaqueId(value)}`;
}

function contextEventPresentation(
  event: ContextEvent,
  summary: DdaConversationSummary,
  locale: 'en' | 'vi-VN',
): AnalysisContextChangeEventV1 {
  const binding = summary.datasets.find((item) => item.datasetId === event.datasetId);
  const fromVersionLabel = versionLabel(event.beforeVersionId, locale);
  const toVersionLabel = versionLabel(event.afterVersionId, locale);
  return Object.freeze({
    eventId: event.eventId,
    kind: event.kind,
    conversationId: event.conversationId,
    ...(event.datasetId === undefined
      ? {}
      : {
          datasetLabel:
            locale === 'vi-VN'
              ? `Bộ dữ liệu ${shortOpaqueId(binding?.datasetId ?? event.datasetId)}`
              : `Dataset ${shortOpaqueId(binding?.datasetId ?? event.datasetId)}`,
        }),
    ...(fromVersionLabel === undefined ? {} : { fromVersionLabel }),
    ...(toVersionLabel === undefined ? {} : { toVersionLabel }),
  });
}

function turnError(error: unknown): AnalysisTurnErrorV1 {
  if (error instanceof AnalysisConversationApiError) {
    if (error.code === 'AGENT_TURN_FORBIDDEN') return 'FORBIDDEN';
    if (error.code === 'AGENT_TURN_STALE_CONTEXT') return 'STALE_CONTEXT';
    if (error.code === 'AGENT_TURN_USAGE_DENIED') return 'USAGE_DENIED';
  }
  return 'UNAVAILABLE';
}

function DemoAnalysisRoutePage({ locale }: { readonly locale: 'en' | 'vi-VN' }) {
  const [searchParameters, setSearchParameters] = useSearchParams();
  const requestedDatasetId = searchParameters.get('dataset');
  const availableDatasets = useSyncExternalStore(
    localDataStore.subscribe,
    () => localDataStore.getDatasets(),
    () => localDataStore.getDatasets(),
  );

  const [demoConversations, setDemoConversations] = useState<readonly AnalysisConversationV1[]>(
    INITIAL_DEMO_CONVERSATIONS,
  );
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(
    INITIAL_DEMO_CONVERSATIONS[0]?.conversationId,
  );

  // If a dataset parameter was passed in url, create or focus conversation on it
  useEffect(() => {
    if (!requestedDatasetId) return;
    const targetDataset = localDataStore.getDataset(requestedDatasetId);
    if (!targetDataset) return;

    const existing = demoConversations.find((c) => c.datasetId === requestedDatasetId);
    if (existing) {
      setActiveConversationId(existing.conversationId);
      return;
    }

    const newId = crypto.randomUUID();
    const newConv: AnalysisConversationV1 = {
      conversationId: newId,
      title: `${locale === 'vi-VN' ? 'Phân tích' : 'Analysis'}: ${targetDataset.label}`,
      updatedLabel: locale === 'vi-VN' ? 'Vừa xong' : 'Just now',
      datasetId: targetDataset.datasetId,
      datasetContext: [
        {
          datasetLabel: targetDataset.label,
          datasetVersionLabel: targetDataset.versionLabel,
          datasetId: targetDataset.datasetId,
        },
      ],
      messages: [],
    };
    setDemoConversations((current) => [newConv, ...current]);
    setActiveConversationId(newId);
  }, [demoConversations, locale, requestedDatasetId]);

  useEffect(() => {
    workspaceAgentStore.setConversations(
      demoConversations.map((conversation) => {
        const context = conversation.datasetContext[0];
        return {
          conversationId: conversation.conversationId,
          title: conversation.title,
          datasetLabel:
            context?.datasetLabel ?? (locale === 'vi-VN' ? 'Ngữ cảnh hiện tại' : 'Current context'),
          datasetVersionLabel:
            context?.datasetVersionLabel ??
            (locale === 'vi-VN' ? 'Phiên bản hiện tại' : 'Current version'),
          messages: conversation.messages.map((message) => ({
            messageId: message.messageId,
            role: message.role === 'USER' ? ('USER' as const) : ('ASSISTANT' as const),
            text: message.text,
            ...(message.createdLabel === undefined ? {} : { createdLabel: message.createdLabel }),
          })),
        };
      }),
    );
    if (activeConversationId !== undefined) {
      workspaceAgentStore.selectConversation(activeConversationId);
    }
  }, [activeConversationId, demoConversations, locale]);

  function handleCreateConversation() {
    const defaultDataset = availableDatasets[0];
    const conversationId = crypto.randomUUID();
    const newConv: AnalysisConversationV1 = {
      conversationId,
      title: locale === 'vi-VN' ? 'Phân tích mới' : 'New analysis',
      updatedLabel: locale === 'vi-VN' ? 'Bây giờ' : 'Now',
      ...(defaultDataset?.datasetId !== undefined ? { datasetId: defaultDataset.datasetId } : {}),
      datasetContext: [
        {
          datasetLabel:
            defaultDataset?.label ?? (locale === 'vi-VN' ? 'Bán hàng toàn quốc' : 'National sales'),
          datasetVersionLabel:
            defaultDataset?.versionLabel ?? (locale === 'vi-VN' ? 'Phiên bản 1' : 'Version 1'),
          ...(defaultDataset?.datasetId !== undefined
            ? { datasetId: defaultDataset.datasetId }
            : {}),
        },
      ],
      messages: [],
    };
    setDemoConversations((current) => [newConv, ...current]);
    setActiveConversationId(conversationId);
  }

  function handleSendMessage(message: string, conversationId?: string) {
    if (conversationId === undefined) return;
    const activeConv = demoConversations.find((c) => c.conversationId === conversationId);
    const targetDatasetId = activeConv?.datasetId ?? activeConv?.datasetContext[0]?.datasetId;
    const localResult = executeLocalAnalysis(message, targetDatasetId, locale);

    setDemoConversations((current) =>
      current.map((conversation) => {
        if (conversation.conversationId !== conversationId) return conversation;
        const userMsg = {
          messageId: crypto.randomUUID(),
          role: 'USER' as const,
          text: message,
          createdLabel: locale === 'vi-VN' ? 'Bây giờ' : 'Now',
        };
        const agentMsg = {
          messageId: crypto.randomUUID(),
          role: 'AGENT' as const,
          text: localResult.answerText,
          createdLabel: locale === 'vi-VN' ? 'Bây giờ' : 'Now',
          ...(localResult.chartProposal !== undefined
            ? { chartProposal: localResult.chartProposal }
            : {}),
        };
        return {
          ...conversation,
          title: conversation.messages.length === 0 ? message.slice(0, 32) : conversation.title,
          messages: [...conversation.messages, userMsg, agentMsg],
        };
      }),
    );
  }

  return (
    <AnalysisPage
      {...(activeConversationId === undefined ? {} : { activeConversationId })}
      locale={locale}
      store={workspaceAgentStore}
      conversations={demoConversations}
      onCreateConversation={handleCreateConversation}
      onSelectConversation={setActiveConversationId}
      onSendMessage={handleSendMessage}
    />
  );
}

function LiveAnalysisRoutePage({ locale }: { readonly locale: 'en' | 'vi-VN' }) {
  const [searchParameters, setSearchParameters] = useSearchParams();
  const [sendError, setSendError] = useState<AnalysisTurnErrorV1 | undefined>();
  const [createError, setCreateError] = useState<'NO_DATASETS' | 'FAILED' | undefined>();
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<readonly string[]>([]);
  const [localFallbackMessages, setLocalFallbackMessages] = useState<
    readonly {
      readonly conversationId: string;
      readonly messageId: string;
      readonly role: 'USER' | 'AGENT';
      readonly text: string;
      readonly chartProposal?: LocalAnalysisChartProposal;
    }[]
  >([]);
  const queryClient = useQueryClient();
  const { baseUrl } = analysisConversationApiConfiguration();
  const dataBaseUrl = dataApiBaseConfiguration().baseUrl;
  const historyKey = [
    'dda-analysis',
    AUTHORIZED_WORKSPACE_CACHE_SCOPE,
    baseUrl,
    'conversations',
  ] as const;
  const historyQuery = useQuery({
    queryKey: historyKey,
    queryFn: ({ signal }) => fetchAuthorizedConversationHistory({ baseUrl, limit: 20, signal }),
    retry: false,
  });
  const datasetsKey = [
    'dda-analysis',
    AUTHORIZED_WORKSPACE_CACHE_SCOPE,
    dataBaseUrl,
    'datasets',
  ] as const;
  const datasetsQuery = useQuery({
    queryKey: datasetsKey,
    queryFn: ({ signal }) => fetchAuthorizedDataIndex({ baseUrl: dataBaseUrl, locale, signal }),
    retry: false,
  });
  const datasets = datasetsQuery.data ?? [];

  useEffect(() => {
    const requested = searchParameters.get('dataset');
    if (selectedDatasetIds.length > 0) return;
    const requestedDataset =
      requested !== null && datasets.some((dataset) => dataset.datasetId === requested)
        ? requested
        : datasets[0]?.datasetId;
    if (requestedDataset !== undefined) setSelectedDatasetIds([requestedDataset]);
  }, [datasets, searchParameters, selectedDatasetIds.length]);

  const authorizedSummaries = historyQuery.data?.items ?? [];
  const requestedConversationId = searchParameters.get('conversation') ?? undefined;
  const storedConversationId = workspaceAgentStore.getActiveConversation()?.conversationId;
  const activeConversationId =
    authorizedSummaries.find((item) => item.conversationId === requestedConversationId)
      ?.conversationId ??
    authorizedSummaries.find((item) => item.conversationId === storedConversationId)
      ?.conversationId ??
    authorizedSummaries[0]?.conversationId;
  const activeSummary = authorizedSummaries.find(
    (item) => item.conversationId === activeConversationId,
  );
  const conversationKey = [...historyKey, 'conversation', activeConversationId ?? 'none'] as const;
  const conversationQuery = useQuery({
    queryKey: conversationKey,
    queryFn: ({ signal }) =>
      fetchAuthorizedConversation({
        baseUrl,
        conversationId: activeConversationId ?? '',
        limit: 50,
        signal,
      }),
    enabled: activeConversationId !== undefined,
    retry: false,
  });

  useEffect(() => {
    if (historyQuery.isError) {
      workspaceAgentStore.setConversations([]);
      return;
    }
    if (historyQuery.isSuccess && activeSummary === undefined) {
      workspaceAgentStore.setConversations([]);
      return;
    }
    if (activeSummary === undefined) return;
    workspaceAgentStore.setConversations(
      authorizedSummaries.map((summary) => {
        const context = datasetContext(summary, locale)[0];
        return {
          conversationId: summary.conversationId,
          title: summary.title,
          datasetLabel:
            context?.datasetLabel ?? (locale === 'vi-VN' ? 'Ngữ cảnh hiện tại' : 'Current context'),
          datasetVersionLabel:
            context?.datasetVersionLabel ??
            (locale === 'vi-VN' ? 'Phiên bản hiện tại' : 'Current version'),
        };
      }),
    );
    workspaceAgentStore.selectConversation(activeSummary.conversationId);
  }, [activeSummary, authorizedSummaries, historyQuery.isError, historyQuery.isSuccess, locale]);

  const historyConversations = useMemo(
    () => authorizedSummaries.map((item) => summaryPresentation(item, locale)),
    [authorizedSummaries, locale],
  );
  const loadedConversation = useMemo(
    () =>
      conversationQuery.data === undefined
        ? undefined
        : loadedConversationPresentation(conversationQuery.data, locale),
    [conversationQuery.data, locale],
  );

  useEffect(() => {
    if (loadedConversation === undefined || activeSummary === undefined) return;
    const context = datasetContext(activeSummary, locale)[0];
    workspaceAgentStore.setActiveConversation({
      conversationId: loadedConversation.conversationId,
      title: loadedConversation.title,
      datasetLabel:
        context?.datasetLabel ?? (locale === 'vi-VN' ? 'Ngữ cảnh hiện tại' : 'Current context'),
      datasetVersionLabel:
        context?.datasetVersionLabel ??
        (locale === 'vi-VN' ? 'Phiên bản hiện tại' : 'Current version'),
      messages: loadedConversation.messages.map((message) => ({
        messageId: message.messageId,
        role: message.role === 'USER' ? ('USER' as const) : ('ASSISTANT' as const),
        text: message.text,
        ...(message.createdLabel === undefined ? {} : { createdLabel: message.createdLabel }),
      })),
    });
  }, [activeSummary, loadedConversation, locale]);
  const conversations = useMemo(
    () =>
      historyConversations.map((item) => {
        const base =
          item.conversationId === loadedConversation?.conversationId ? loadedConversation : item;
        const extra = localFallbackMessages.filter((m) => m.conversationId === base.conversationId);
        if (extra.length === 0) return base;
        return {
          ...base,
          messages: [
            ...base.messages,
            ...extra.map((m) => ({
              messageId: m.messageId,
              role: m.role,
              text: m.text,
              ...(m.chartProposal ? { chartProposal: m.chartProposal } : {}),
            })),
          ],
        };
      }),
    [historyConversations, loadedConversation, localFallbackMessages],
  );
  const contextEvents = useMemo(
    () =>
      conversationQuery.data?.contextEvents.map((event) =>
        contextEventPresentation(event, conversationQuery.data.conversation, locale),
      ) ?? [],
    [conversationQuery.data, locale],
  );
  const turnMutation = useMutation({
    mutationFn: (input: { readonly conversationId: string; readonly text: string }) => {
      const messageId = crypto.randomUUID();
      return runAuthorizedAgentTurn({
        baseUrl,
        conversationId: input.conversationId,
        messageId,
        text: input.text,
        idempotencyKey: `turn:${messageId}`,
        locale,
      });
    },
  });

  async function sendMessage(message: string, conversationId?: string) {
    if (conversationId === undefined || conversationId !== activeConversationId) return;
    setSendError(undefined);
    try {
      await turnMutation.mutateAsync({ conversationId, text: message });
      await queryClient.invalidateQueries({ queryKey: conversationKey, exact: true });
    } catch (error) {
      if (
        error instanceof AnalysisConversationApiError &&
        (error.code === 'AGENT_TURN_FORBIDDEN' ||
          error.code === 'CONVERSATION_FORBIDDEN' ||
          error.code === 'AGENT_TURN_USAGE_DENIED' ||
          error.code === 'AGENT_TURN_STALE_CONTEXT')
      ) {
        setSendError(turnError(error));
        throw error;
      }
      // In local dev when API is unavailable, run local/OpenAI analysis engine
      try {
        const targetDataset =
          datasets.find((d) => selectedDatasetIds.includes(d.datasetId)) ?? datasets[0];
        const res = await executeAnalysisWithAgent(
          message,
          targetDataset?.datasetId,
          locale,
        );

        setLocalFallbackMessages((prev) => [
          ...prev,
          {
            conversationId,
            messageId: crypto.randomUUID(),
            role: 'USER',
            text: message,
          },
          {
            conversationId,
            messageId: crypto.randomUUID(),
            role: 'AGENT',
            text: res.answerText,
            ...(res.chartProposal !== undefined ? { chartProposal: res.chartProposal } : {}),
          },
        ]);
        return;
      } catch {
        setSendError(turnError(error));
        throw error;
      }
    }
  }

  async function createConversation(): Promise<void> {
    if (creatingConversation) return;
    setCreateError(undefined);
    const anchorableDatasets = datasets.filter(
      (dataset): dataset is typeof dataset & { readonly versionId: string } =>
        dataset.versionId !== undefined && selectedDatasetIds.includes(dataset.datasetId),
    );
    if (anchorableDatasets.length === 0) {
      setCreateError('NO_DATASETS');
      return;
    }
    setCreatingConversation(true);
    try {
      const created = await createAuthorizedConversation({
        baseUrl,
        title: locale === 'vi-VN' ? 'Phân tích mới' : 'New analysis',
        datasetIds: anchorableDatasets.map((dataset) => dataset.datasetId),
        datasetVersionIds: Object.fromEntries(
          anchorableDatasets.map((dataset) => [dataset.datasetId, dataset.versionId as string]),
        ),
        idempotencyKey: `conversation-${crypto.randomUUID()}`,
      });
      await queryClient.invalidateQueries({ queryKey: historyKey });
      const next = new URLSearchParams(searchParameters);
      next.set('conversation', created.conversationId);
      setSearchParameters(next);
    } catch {
      setCreateError('FAILED');
    } finally {
      setCreatingConversation(false);
    }
  }

  const noDataNotice =
    locale === 'vi-VN'
      ? 'Chưa có bộ dữ liệu nào. Hãy thêm dữ liệu trong Dữ liệu trước, sau đó quay lại đây để hỏi trợ lý.'
      : 'No datasets exist yet. Add data in Data first, then come back to ask the agent.';
  const createFailedNotice =
    locale === 'vi-VN'
      ? 'Không thể tạo hội thoại mới. Dữ liệu hiện tại vẫn an toàn.'
      : 'The new conversation could not be created. Your data is unchanged.';
  const emptyNotice =
    createError === 'NO_DATASETS'
      ? noDataNotice
      : createError === 'FAILED'
        ? createFailedNotice
        : historyQuery.isSuccess && authorizedSummaries.length === 0 && datasets.length === 0
          ? noDataNotice
          : undefined;

  const historyState = historyQuery.isPending
    ? 'loading'
    : historyQuery.isError
      ? 'error'
      : 'ready';
  const threadState =
    activeConversationId === undefined
      ? 'ready'
      : conversationQuery.isPending
        ? 'loading'
        : conversationQuery.isError
          ? 'error'
          : 'ready';

  return (
    <AnalysisPage
      contextEvents={contextEvents}
      conversations={conversations}
      historyState={historyState}
      locale={locale}
      onCreateConversation={() => void createConversation()}
      onDatasetSelectionChange={setSelectedDatasetIds}
      onSelectConversation={(conversationId) => {
        setSendError(undefined);
        setCreateError(undefined);
        const next = new URLSearchParams(searchParameters);
        next.set('conversation', conversationId);
        setSearchParameters(next);
      }}
      store={workspaceAgentStore}
      threadState={threadState}
      availableDatasets={datasets}
      selectedDatasetIds={selectedDatasetIds}
      {...(activeConversationId === undefined ? {} : { activeConversationId })}
      {...(conversationQuery.isSuccess ? { onSendMessage: sendMessage } : {})}
      {...(emptyNotice === undefined ? {} : { emptyNotice })}
      {...(sendError === undefined ? {} : { turnError: sendError })}
    />
  );
}

/** WEB-024: Analysis is the complete agent surface, never a second floating-agent mount. */
export function AnalysisRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  return dashboardDemoMode() ? (
    <DemoAnalysisRoutePage locale={locale} />
  ) : (
    <LiveAnalysisRoutePage locale={locale} />
  );
}
