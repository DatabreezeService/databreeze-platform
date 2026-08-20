import type {
  ContextEvent,
  DdaConversationListAccepted,
  DdaConversationLoadAccepted,
  DdaConversationSummary,
} from '@databreeze/contracts/v4';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import { workspaceAgentStore } from '../agent/workspace-agent-store.ts';
import { dataApiBaseConfiguration, fetchAuthorizedDataIndex } from '../data/data-api.ts';
import { dataImportApi, type DataImportRecordV1 } from '../data/data-import-api.ts';
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
  AnalysisConversationMessageV1,
  AnalysisDatasetContextV1,
  AnalysisTurnErrorV1,
} from './analysis-model.ts';
import { AnalysisPage } from './analysis-page.tsx';
import { executeApprovedPreviewAnalysis } from './approved-preview-analysis.ts';
import { executeLocalAnalysis } from './local-analysis-engine.ts';

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

type LocalPreviewMessagesByConversationV1 = Readonly<
  Record<string, readonly AnalysisConversationMessageV1[]>
>;

function mergeLocalPreviewMessages(
  conversation: AnalysisConversationV1,
  localMessages: LocalPreviewMessagesByConversationV1,
): AnalysisConversationV1 {
  const extras = localMessages[conversation.conversationId] ?? [];
  if (extras.length === 0) return conversation;
  const existingIds = new Set(conversation.messages.map((message) => message.messageId));
  return Object.freeze({
    ...conversation,
    messages: Object.freeze([
      ...conversation.messages,
      ...extras.filter((message) => !existingIds.has(message.messageId)),
    ]),
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
  const [searchParameters] = useSearchParams();
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
  const [localPreviewMessages, setLocalPreviewMessages] =
    useState<LocalPreviewMessagesByConversationV1>({});
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
  const approvedImportsQuery = useQuery({
    queryKey: [...datasetsKey, 'approved-imports'] as const,
    queryFn: () => dataImportApi.list(50, dataBaseUrl),
    enabled: datasets.length > 0,
    retry: false,
  });

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
  const newConversationRequested = searchParameters.get('new') === '1';
  const requestedConversationId = searchParameters.get('conversation') ?? undefined;
  const storedConversationId = workspaceAgentStore.getActiveConversation()?.conversationId;
  const activeConversationId = newConversationRequested
    ? undefined
    : (authorizedSummaries.find((item) => item.conversationId === requestedConversationId)
        ?.conversationId ??
      authorizedSummaries.find((item) => item.conversationId === storedConversationId)
        ?.conversationId ??
      authorizedSummaries[0]?.conversationId);
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
        return mergeLocalPreviewMessages(base, localPreviewMessages);
      }),
    [historyConversations, loadedConversation, localPreviewMessages],
  );
  const contextEvents = useMemo(
    () =>
      conversationQuery.data?.contextEvents.map((event) =>
        contextEventPresentation(event, conversationQuery.data.conversation, locale),
      ) ?? [],
    [conversationQuery.data, locale],
  );
  const turnMutation = useMutation({
    mutationFn: (input: {
      readonly conversationId: string;
      readonly messageId: string;
      readonly text: string;
    }) => {
      return runAuthorizedAgentTurn({
        baseUrl,
        conversationId: input.conversationId,
        messageId: input.messageId,
        text: input.text,
        // Keep the browser key within the conservative token grammar shared by
        // the HTTP context, DTO, and durable conversation adapters.
        idempotencyKey: `turn-${input.messageId}`,
        locale,
      });
    },
  });

  async function localPreviewForConversation(
    conversationId: string,
    messageId: string,
    question: string,
  ): Promise<boolean> {
    const summary = authorizedSummaries.find((item) => item.conversationId === conversationId);
    if (summary === undefined || summary.datasets.length === 0) return false;

    let imports = approvedImportsQuery.data;
    if (imports === undefined && approvedImportsQuery.isPending) {
      const refreshed = await approvedImportsQuery.refetch();
      imports = refreshed.data;
    }
    if (imports === undefined) return false;

    const previews = await Promise.all(
      summary.datasets.slice(0, 8).map(async (binding) => {
        const candidate = imports?.find(
          (record: DataImportRecordV1) =>
            record.state === 'READY' && record.accepted?.datasetId === binding.datasetId,
        );
        if (candidate === undefined) return undefined;
        try {
          return await dataImportApi.dashboardPreview(candidate.importId, dataBaseUrl);
        } catch {
          return undefined;
        }
      }),
    );
    const usable = previews.filter(
      (preview): preview is NonNullable<typeof preview> => preview !== undefined,
    );
    if (usable.length === 0) return false;

    const results = usable.map((preview) =>
      executeApprovedPreviewAnalysis(question, preview, locale),
    );
    const first = results[0];
    if (first === undefined) return false;
    const assistantMessage: AnalysisConversationMessageV1 = Object.freeze({
      messageId: `local-preview-${messageId}`,
      role: 'AGENT',
      text: results.map((result) => result.answerText).join('\n\n'),
      createdLabel: locale === 'vi-VN' ? 'Vừa xong' : 'Just now',
      ...(first.chartProposal === undefined ? {} : { chartProposal: first.chartProposal }),
    });
    const userMessage: AnalysisConversationMessageV1 = Object.freeze({
      messageId,
      role: 'USER',
      text: question,
      createdLabel: locale === 'vi-VN' ? 'Vừa xong' : 'Just now',
    });
    setLocalPreviewMessages((current) => ({
      ...current,
      [conversationId]: Object.freeze([userMessage, assistantMessage]),
    }));
    await queryClient.invalidateQueries({ queryKey: conversationKey, exact: true });
    return true;
  }

  async function sendMessage(message: string, conversationId?: string) {
    if (conversationId === undefined || conversationId !== activeConversationId) return;
    setSendError(undefined);
    const messageId = crypto.randomUUID();
    try {
      await turnMutation.mutateAsync({ conversationId, messageId, text: message });
      setLocalPreviewMessages((current) => {
        if (!(conversationId in current)) return current;
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: conversationKey, exact: true });
    } catch (error) {
      if (
        error instanceof AnalysisConversationApiError &&
        error.code === 'AGENT_TURN_UNAVAILABLE' &&
        (await localPreviewForConversation(conversationId, messageId, message))
      ) {
        return;
      }
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
      // The live route must never fabricate an answer when the API/provider is
      // unavailable. Demo analysis is an explicit route mode; authenticated
      // analysis reports the real backend state so the user can retry safely.
      setSendError(turnError(error));
      throw error;
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
          anchorableDatasets.map((dataset) => [dataset.datasetId, dataset.versionId]),
        ),
        idempotencyKey: `conversation-${crypto.randomUUID()}`,
      });
      await queryClient.invalidateQueries({ queryKey: historyKey });
      // The create response is intentionally bounded and does not contain the
      // full authorized summary required by the history list. Load that
      // server-owned summary before changing the route so a stale history
      // projection cannot hide a successfully created session.
      const createdPage = await fetchAuthorizedConversation({
        baseUrl,
        conversationId: created.conversationId,
        limit: 50,
      });
      queryClient.setQueryData<DdaConversationListAccepted>(historyKey, (current) => ({
        accepted: true,
        schemaVersion: 4,
        items: [
          createdPage.conversation,
          ...(current?.items ?? []).filter(
            (item) => item.conversationId !== createdPage.conversation.conversationId,
          ),
        ],
        ...(current?.nextCursor === undefined ? {} : { nextCursor: current.nextCursor }),
      }));
      queryClient.setQueryData(
        [...historyKey, 'conversation', created.conversationId],
        createdPage,
      );
      const next = new URLSearchParams(searchParameters);
      next.delete('new');
      next.set('conversation', created.conversationId);
      setSearchParameters(next);
    } catch {
      setCreateError('FAILED');
    } finally {
      setCreatingConversation(false);
    }
  }

  useEffect(() => {
    // Dashboard history links land here with `new=1`. Wait for the authorized
    // dataset index before creating the server-owned conversation so a cold
    // page load cannot race the data query and incorrectly report no datasets.
    if (
      !newConversationRequested ||
      creatingConversation ||
      datasetsQuery.isPending ||
      datasets.length === 0
    ) {
      return;
    }
    void createConversation();
    // createConversation is intentionally scoped to this route's current
    // workspace query; the URL is replaced with the created conversation on
    // success, which removes `new=1` and prevents a second creation.
  }, [newConversationRequested, creatingConversation, datasetsQuery.isPending, datasets.length]);

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
