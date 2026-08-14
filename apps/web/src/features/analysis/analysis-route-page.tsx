import type {
  ContextEvent,
  DdaConversationLoadAccepted,
  DdaConversationSummary,
} from '@databreeze/contracts/v4';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import { workspaceAgentStore } from '../agent/workspace-agent-store.ts';
import { dashboardDemoMode } from '../dashboards/dashboard-api.ts';
import {
  AnalysisConversationApiError,
  analysisConversationApiConfiguration,
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

const AUTHORIZED_WORKSPACE_CACHE_SCOPE = 'authorized-current-workspace';

const DEMO_CONVERSATIONS: readonly AnalysisConversationV1[] = Object.freeze([
  Object.freeze({
    conversationId: 'demo-revenue-analysis',
    title: 'Doanh thu theo khu vực',
    updatedLabel: 'Hôm nay, 10:24',
    datasetContext: Object.freeze([
      Object.freeze({ datasetLabel: 'Bán hàng toàn quốc', datasetVersionLabel: 'Phiên bản 12' }),
      Object.freeze({ datasetLabel: 'Mục tiêu doanh thu', datasetVersionLabel: 'Phiên bản 4' }),
    ]),
    messages: Object.freeze([
      Object.freeze({
        messageId: 'demo-message-1',
        role: 'USER' as const,
        text: 'Khu vực nào đang tăng trưởng tốt nhất trong quý này?',
        createdLabel: '10:22',
      }),
      Object.freeze({
        messageId: 'demo-message-2',
        role: 'AGENT' as const,
        text: 'Miền Nam tăng 18,4% so với quý trước và dẫn đầu về doanh thu. Tôi đã dùng phiên bản mới nhất của hai bộ dữ liệu được chọn.',
        createdLabel: '10:24',
      }),
    ]),
  }),
  Object.freeze({
    conversationId: 'demo-orders-analysis',
    title: 'Đơn hàng bất thường',
    updatedLabel: 'Hôm qua',
    datasetContext: Object.freeze([
      Object.freeze({ datasetLabel: 'Bán hàng toàn quốc', datasetVersionLabel: 'Phiên bản 12' }),
    ]),
    messages: Object.freeze([]),
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
  const [demoConversations, setDemoConversations] = useState(DEMO_CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState(
    DEMO_CONVERSATIONS[0]?.conversationId,
  );

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
        };
      }),
    );
    if (activeConversationId !== undefined) {
      workspaceAgentStore.selectConversation(activeConversationId);
    }
  }, [activeConversationId, demoConversations, locale]);

  return (
    <AnalysisPage
      {...(activeConversationId === undefined ? {} : { activeConversationId })}
      locale={locale}
      store={workspaceAgentStore}
      conversations={demoConversations}
      onCreateConversation={() => {
        const conversationId = crypto.randomUUID();
        setDemoConversations((current) => [
          {
            conversationId,
            title: locale === 'vi-VN' ? 'Phân tích mới' : 'New analysis',
            updatedLabel: locale === 'vi-VN' ? 'Bây giờ' : 'Now',
            datasetContext: [
              {
                datasetLabel: locale === 'vi-VN' ? 'Bán hàng toàn quốc' : 'National sales',
                datasetVersionLabel: locale === 'vi-VN' ? 'Phiên bản 12' : 'Version 12',
              },
            ],
            messages: [],
          },
          ...current,
        ]);
        setActiveConversationId(conversationId);
      }}
      onSelectConversation={setActiveConversationId}
      onSendMessage={(message: string, conversationId?: string) => {
        if (conversationId === undefined) return;
        setDemoConversations((current) =>
          current.map((conversation) =>
            conversation.conversationId !== conversationId
              ? conversation
              : {
                  ...conversation,
                  messages: [
                    ...conversation.messages,
                    {
                      messageId: crypto.randomUUID(),
                      role: 'USER' as const,
                      text: message,
                      createdLabel: locale === 'vi-VN' ? 'Bây giờ' : 'Now',
                    },
                  ],
                },
          ),
        );
      }}
    />
  );
}

function LiveAnalysisRoutePage({ locale }: { readonly locale: 'en' | 'vi-VN' }) {
  const [searchParameters, setSearchParameters] = useSearchParams();
  const [sendError, setSendError] = useState<AnalysisTurnErrorV1 | undefined>();
  const queryClient = useQueryClient();
  const { baseUrl } = analysisConversationApiConfiguration();
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
  const conversations = useMemo(
    () =>
      historyConversations.map((item) =>
        item.conversationId === loadedConversation?.conversationId ? loadedConversation : item,
      ),
    [historyConversations, loadedConversation],
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
      setSendError(turnError(error));
      throw error;
    }
  }

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
      onSelectConversation={(conversationId) => {
        setSendError(undefined);
        const next = new URLSearchParams(searchParameters);
        next.set('conversation', conversationId);
        setSearchParameters(next);
      }}
      store={workspaceAgentStore}
      threadState={threadState}
      {...(activeConversationId === undefined ? {} : { activeConversationId })}
      {...(conversationQuery.isSuccess ? { onSendMessage: sendMessage } : {})}
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
