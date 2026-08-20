import type { DdaConversationLoadAccepted, DdaConversationSummary } from '@databreeze/contracts/v4';
import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  AnalysisConversationApiError,
  analysisConversationApiConfiguration,
  fetchAuthorizedConversation,
  fetchAuthorizedConversationHistory,
  runAuthorizedAgentTurn,
} from '../analysis/analysis-api.ts';
import { executeApprovedPreviewAnalysis } from '../analysis/approved-preview-analysis.ts';
import { dataApiBaseConfiguration } from '../data/data-api.ts';
import { dataImportApi } from '../data/data-import-api.ts';
import { AgentChatShell } from './agent-chat-shell.tsx';
import { resolveAgentOpenMotion } from './agent-open-motion.ts';
import type {
  AgentConversationSummaryV1,
  AgentMessagePresentationV1,
  AgentStoreV1,
} from './agent-store.ts';

type LoadStateV1 = 'idle' | 'loading' | 'ready' | 'error';

function shortOpaqueId(value: string): string {
  return `…${value.slice(-8)}`;
}

function dateLabel(value: string, locale: 'en' | 'vi-VN'): string | undefined {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return undefined;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

function contextPresentation(
  summary: DdaConversationSummary,
  locale: 'en' | 'vi-VN',
): Pick<AgentConversationSummaryV1, 'datasetLabel' | 'datasetVersionLabel'> {
  const first = summary.datasets[0];
  if (first === undefined) {
    return {
      datasetLabel: locale === 'vi-VN' ? 'Ngữ cảnh hiện tại' : 'Current context',
      datasetVersionLabel: locale === 'vi-VN' ? 'Phiên bản hiện tại' : 'Current version',
    };
  }
  const datasetLabel =
    locale === 'vi-VN'
      ? `Bộ dữ liệu ${shortOpaqueId(first.datasetId)}`
      : `Dataset ${shortOpaqueId(first.datasetId)}`;
  const extraCount = summary.datasets.length - 1;
  return {
    datasetLabel: extraCount > 0 ? `${datasetLabel} +${extraCount}` : datasetLabel,
    datasetVersionLabel:
      locale === 'vi-VN'
        ? `Phiên bản ${shortOpaqueId(first.datasetVersionId)}`
        : `Version ${shortOpaqueId(first.datasetVersionId)}`,
  };
}

function summaryPresentation(
  summary: DdaConversationSummary,
  locale: 'en' | 'vi-VN',
): AgentConversationSummaryV1 {
  return Object.freeze({
    conversationId: summary.conversationId,
    title: summary.title,
    ...contextPresentation(summary, locale),
  });
}

function loadedPresentation(
  page: DdaConversationLoadAccepted,
  locale: 'en' | 'vi-VN',
): AgentConversationSummaryV1 {
  const messages: readonly AgentMessagePresentationV1[] = page.messages
    .filter((message) => message.role !== 'SYSTEM')
    .map((message) => {
      const createdLabel = dateLabel(message.createdAt, locale);
      return {
        messageId: message.messageId,
        role: message.role === 'USER' ? ('USER' as const) : ('ASSISTANT' as const),
        text: message.text,
        ...(createdLabel === undefined ? {} : { createdLabel }),
      };
    });
  return Object.freeze({
    ...summaryPresentation(page.conversation, locale),
    messages: Object.freeze(messages),
  });
}

function errorMessage(
  error: unknown,
  locale: 'en' | 'vi-VN',
  action: 'history' | 'conversation' | 'turn',
): string {
  const forbidden =
    error instanceof AnalysisConversationApiError &&
    (error.code === 'CONVERSATION_FORBIDDEN' || error.code === 'AGENT_TURN_FORBIDDEN');
  if (locale === 'vi-VN') {
    if (forbidden)
      return 'Hội thoại này không còn được cấp quyền. Mở Phân tích để chọn dữ liệu khác.';
    if (action === 'turn')
      return 'Không thể gửi câu hỏi lúc này. Nội dung vẫn được giữ lại để bạn thử lại.';
    if (action === 'conversation') return 'Không thể tải hội thoại này. Hãy thử lại từ Phân tích.';
    return 'Không thể tải lịch sử hội thoại được cấp quyền. Mở Phân tích để thử lại.';
  }
  if (forbidden)
    return 'This conversation is no longer authorized. Open Analysis to choose another dataset.';
  if (action === 'turn')
    return 'The question could not be sent. Your draft is kept so you can retry.';
  if (action === 'conversation')
    return 'This conversation could not be loaded. Try again from Analysis.';
  return 'Authorized conversation history could not be loaded. Open Analysis to retry.';
}

export function FloatingAgentPanel({
  store,
  locale,
  surface,
}: {
  readonly store: AgentStoreV1;
  readonly locale: 'en' | 'vi-VN';
  readonly surface: 'dashboard' | 'data' | 'analysis';
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [historyState, setHistoryState] = useState<LoadStateV1>('idle');
  const [conversationState, setConversationState] = useState<LoadStateV1>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [turnError, setTurnError] = useState(false);
  const [historyItems, setHistoryItems] = useState<readonly DdaConversationSummary[]>([]);
  const baseUrl = analysisConversationApiConfiguration().baseUrl;
  const activeConversation = snapshot.activeConversation;
  const activeConversationId = activeConversation?.conversationId;

  useEffect(() => {
    if (surface === 'analysis' || !snapshot.open) return undefined;
    const controller = new AbortController();
    setHistoryState('loading');
    setConversationState('idle');
    setTurnError(false);
    void fetchAuthorizedConversationHistory({ baseUrl, limit: 20, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setHistoryItems(page.items);
        store.setConversations(page.items.map((summary) => summaryPresentation(summary, locale)));
        setHistoryState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHistoryItems([]);
        store.setConversations([]);
        setHistoryState('error');
        setConversationState('idle');
        void error;
      });
    return () => controller.abort();
  }, [baseUrl, locale, snapshot.open, store, surface]);

  useEffect(() => {
    if (
      surface === 'analysis' ||
      !snapshot.open ||
      historyState !== 'ready' ||
      activeConversationId === undefined
    ) {
      if (historyState === 'ready' && activeConversationId === undefined)
        setConversationState('ready');
      return undefined;
    }
    const controller = new AbortController();
    setConversationState('loading');
    setTurnError(false);
    void fetchAuthorizedConversation({
      baseUrl,
      conversationId: activeConversationId,
      limit: 50,
      signal: controller.signal,
    })
      .then((page) => {
        if (controller.signal.aborted) return;
        store.setActiveConversation(loadedPresentation(page, locale));
        setConversationState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setConversationState('error');
        void error;
      });
    return () => controller.abort();
  }, [activeConversationId, baseUrl, historyState, locale, snapshot.open, store, surface]);

  if (surface === 'analysis') {
    return (
      <section
        aria-label={locale === 'vi-VN' ? 'Phân tích' : 'Analysis'}
        className="analysis-agent-region"
      >
        <p>
          {locale === 'vi-VN'
            ? 'Trợ lý dùng toàn bộ khu vực Phân tích, không hiện nút nổi thứ hai.'
            : 'The agent uses the full Analysis area. No second floating button.'}
        </p>
        {snapshot.activeConversation ? <p>{snapshot.activeConversation.title}</p> : null}
      </section>
    );
  }

  if (!snapshot.open) return null;
  const text =
    locale === 'vi-VN'
      ? {
          empty: 'Mở Phân tích để bắt đầu một hội thoại được gắn với dữ liệu của bạn.',
          loading: 'Đang tải hội thoại được cấp quyền…',
          title: 'Trợ lý DataBreeze',
        }
      : {
          empty: 'Open Analysis to start a conversation bound to your data.',
          loading: 'Loading authorized conversations…',
          title: 'DataBreeze Agent',
        };

  async function tryLocalApprovedPreview(
    conversationId: string,
    messageId: string,
    question: string,
  ): Promise<boolean> {
    const summary = historyItems.find((item) => item.conversationId === conversationId);
    if (summary === undefined || summary.datasets.length === 0) return false;

    try {
      const dataBaseUrl = dataApiBaseConfiguration().baseUrl;
      const imports = await dataImportApi.list(50, dataBaseUrl);
      const previews = await Promise.all(
        summary.datasets.slice(0, 8).map(async (binding) => {
          const approved = imports.find(
            (record) =>
              record.state === 'READY' && record.accepted?.datasetId === binding.datasetId,
          );
          if (approved === undefined) return undefined;
          try {
            return await dataImportApi.dashboardPreview(approved.importId, dataBaseUrl);
          } catch {
            return undefined;
          }
        }),
      );
      const usable = previews.filter(
        (preview): preview is NonNullable<typeof preview> => preview !== undefined,
      );
      if (usable.length === 0) return false;

      const answers = usable.map(
        (preview) => executeApprovedPreviewAnalysis(question, preview, locale).answerText,
      );
      const page = await fetchAuthorizedConversation({
        baseUrl,
        conversationId,
        limit: 50,
      });
      const presentation = loadedPresentation(page, locale);
      store.setActiveConversation(presentation);
      if (!(presentation.messages ?? []).some((item) => item.messageId === messageId)) {
        store.appendMessage(conversationId, {
          messageId,
          role: 'USER',
          text: question,
          createdLabel: locale === 'vi-VN' ? 'Vừa xong' : 'Just now',
        });
      }
      store.appendMessage(conversationId, {
        messageId: `local-preview-${messageId}`,
        role: 'ASSISTANT',
        text: answers.join('\n\n'),
        createdLabel: locale === 'vi-VN' ? 'Vừa xong' : 'Just now',
      });
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmitMessage(message: string): Promise<void> {
    if (
      activeConversationId === undefined ||
      historyState !== 'ready' ||
      conversationState !== 'ready' ||
      submitting
    )
      return;
    const conversationId = activeConversationId;
    const messageId = globalThis.crypto.randomUUID();
    setSubmitting(true);
    setConversationState('loading');
    setTurnError(false);
    try {
      const idempotencyKey = globalThis.crypto.randomUUID();
      await runAuthorizedAgentTurn({
        baseUrl,
        conversationId,
        messageId,
        text: message,
        idempotencyKey,
        locale,
      });
      const page = await fetchAuthorizedConversation({
        baseUrl,
        conversationId,
        limit: 50,
      });
      store.setActiveConversation(loadedPresentation(page, locale));
      setConversationState('ready');
    } catch (error: unknown) {
      if (
        error instanceof AnalysisConversationApiError &&
        error.code === 'AGENT_TURN_UNAVAILABLE' &&
        (await tryLocalApprovedPreview(conversationId, messageId, message))
      ) {
        setConversationState('ready');
        return;
      }
      setTurnError(true);
      setConversationState('error');
      throw error;
    } finally {
      setSubmitting(false);
    }
  }

  const stateMessage =
    historyState === 'loading'
      ? text.loading
      : historyState === 'error'
        ? errorMessage(new Error('HISTORY_UNAVAILABLE'), locale, 'history')
        : activeConversationId === undefined
          ? text.empty
          : conversationState === 'loading'
            ? text.loading
            : conversationState === 'error'
              ? errorMessage(
                  new Error(turnError ? 'TURN_UNAVAILABLE' : 'CONVERSATION_UNAVAILABLE'),
                  locale,
                  turnError ? 'turn' : 'conversation',
                )
              : undefined;
  const canSend =
    activeConversationId !== undefined &&
    historyState === 'ready' &&
    conversationState === 'ready' &&
    !submitting;
  const analysisHref = `/${locale}/analysis${
    activeConversationId === undefined
      ? ''
      : `?conversation=${encodeURIComponent(activeConversationId)}`
  }`;

  return (
    <aside
      aria-label={locale === 'vi-VN' ? 'Trợ lý' : 'Agent'}
      className="floating-agent-panel"
      data-open-motion={resolveAgentOpenMotion()}
    >
      <AgentChatShell
        {...(activeConversation === undefined
          ? {}
          : {
              activeConversationId: activeConversation.conversationId,
              context: `${activeConversation.datasetLabel} · ${activeConversation.datasetVersionLabel}`,
            })}
        analysisHref={analysisHref}
        conversations={snapshot.conversations}
        headingTitle={text.title}
        locale={locale}
        messages={activeConversation?.messages ?? []}
        newConversationHref={`/${locale}/analysis?new=1`}
        onClose={() => store.setOpen(false)}
        onSelectConversation={(conversationId) => store.selectConversation(conversationId)}
        {...(canSend ? { onSubmitMessage: handleSubmitMessage } : {})}
        {...(stateMessage === undefined ? {} : { stateMessage })}
        stateTone={historyState === 'error' || conversationState === 'error' ? 'alert' : 'status'}
        submitting={submitting}
      />
    </aside>
  );
}
