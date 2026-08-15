import { useEffect, useMemo, useState } from 'react';

import type { AgentStoreV1 } from '../agent/agent-store.ts';
import { ContextChangeEvent } from './context-change-event.tsx';
import { ConversationHistory } from './conversation-history.tsx';
import { ConversationThread } from './conversation-thread.tsx';
import type {
  AnalysisContextChangeEventV1,
  AnalysisConversationV1,
  AnalysisLoadStateV1,
  AnalysisTurnErrorV1,
} from './analysis-model.ts';
import './analysis-page.css';

function legacyConversation(store: AgentStoreV1 | undefined): AnalysisConversationV1 | undefined {
  const active = store?.getActiveConversation();
  if (active === undefined) return undefined;
  return {
    conversationId: active.conversationId,
    title: active.title,
    datasetContext: [
      {
        datasetLabel: active.datasetLabel,
        datasetVersionLabel: active.datasetVersionLabel,
      },
    ],
    messages: [],
  };
}

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        empty: 'Chọn một hội thoại được cấp quyền để xem toàn bộ ngữ cảnh phân tích.',
        error: 'Không thể tải hội thoại. Dữ liệu cũ không được hiển thị.',
        heading: 'Phân tích',
        loading: 'Đang tải hội thoại được cấp quyền…',
        supporting:
          'Hội thoại chỉ dùng dữ liệu và phiên bản đã được cấp quyền trong không gian làm việc.',
        threadError: 'Không thể mở hội thoại này bằng quyền hiện tại.',
        threadLoading: 'Đang mở hội thoại…',
        turnForbidden: 'Bạn không có quyền trò chuyện với trợ lý trong không gian làm việc này.',
        turnStale: 'Dữ liệu đã thay đổi. Hãy tải ngữ cảnh mới trước khi gửi lại.',
        turnUsage: 'Không thể chạy phân tích vì giới hạn sử dụng hiện tại.',
        turnUnavailable: 'Chưa thể gửi câu hỏi. Nội dung của bạn vẫn được giữ lại.',
      }
    : {
        empty: 'Select an authorized conversation to view its full analysis context.',
        error: 'Conversations could not be loaded. Stale data is not displayed.',
        heading: 'Analysis',
        loading: 'Loading authorized conversations…',
        supporting:
          'Conversations use only workspace data and versions that are already authorized.',
        threadError: 'This conversation cannot be opened with the current permission.',
        threadLoading: 'Opening conversation…',
        turnForbidden: 'You do not have permission to chat with the agent in this workspace.',
        turnStale: 'The data changed. Load the new context before sending again.',
        turnUsage: 'Analysis cannot run under the current usage limit.',
        turnUnavailable: 'The question could not be sent. Your draft is still available.',
      };
}

export interface AnalysisPageProps {
  readonly activeConversationId?: string;
  readonly contextEvents?: readonly AnalysisContextChangeEventV1[];
  readonly conversations?: readonly AnalysisConversationV1[];
  readonly historyState?: AnalysisLoadStateV1;
  readonly locale: 'en' | 'vi-VN';
  readonly onSelectConversation?: (conversationId: string) => void;
  readonly onCreateConversation?: () => void;
  readonly onSendMessage?: (message: string, conversationId?: string) => unknown;
  readonly store?: AgentStoreV1;
  readonly threadState?: AnalysisLoadStateV1;
  readonly turnError?: AnalysisTurnErrorV1;
}

/** WEB-024/DDA-055/056: the full agent destination; it never renders a second floating agent. */
export function AnalysisPage({
  activeConversationId,
  contextEvents = [],
  conversations,
  historyState = 'ready',
  locale,
  onSelectConversation,
  onCreateConversation,
  onSendMessage,
  store,
  threadState = 'ready',
  turnError,
}: AnalysisPageProps) {
  const legacy = legacyConversation(store);
  const authorizedConversations = conversations ?? (legacy === undefined ? [] : [legacy]);
  const suppliedActiveId = activeConversationId ?? legacy?.conversationId;
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(
    suppliedActiveId ?? authorizedConversations[0]?.conversationId,
  );
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const text = copy(locale);

  useEffect(() => {
    const requested = suppliedActiveId ?? authorizedConversations[0]?.conversationId;
    if (
      requested !== undefined &&
      authorizedConversations.some((item) => item.conversationId === requested)
    ) {
      setSelectedConversationId(requested);
      return;
    }
    if (!authorizedConversations.some((item) => item.conversationId === selectedConversationId)) {
      setSelectedConversationId(undefined);
    }
  }, [authorizedConversations, selectedConversationId, suppliedActiveId]);

  const active = useMemo(
    () => authorizedConversations.find((item) => item.conversationId === selectedConversationId),
    [authorizedConversations, selectedConversationId],
  );
  const activeEvents = contextEvents.filter(
    (event) =>
      event.conversationId === undefined || event.conversationId === active?.conversationId,
  );

  const turnErrorText =
    turnError === 'FORBIDDEN'
      ? text.turnForbidden
      : turnError === 'STALE_CONTEXT'
        ? text.turnStale
        : turnError === 'USAGE_DENIED'
          ? text.turnUsage
          : turnError === 'UNAVAILABLE'
            ? text.turnUnavailable
            : undefined;

  if (historyState !== 'ready') {
    const statusText = historyState === 'loading' ? text.loading : text.error;
    return (
      <main className="analysis-page">
        <header className="analysis-page__heading">
          <div>
            <h1>{text.heading}</h1>
            <p>{text.supporting}</p>
          </div>
        </header>
        <section className="analysis-page__empty" role="status">
          <p>{statusText}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="analysis-page">
      <header className="analysis-page__heading">
        <div>
          <h1>{text.heading}</h1>
          <p>{text.supporting}</p>
        </div>
      </header>
      <div className="analysis-page__layout">
        <ConversationHistory
          collapsed={historyCollapsed}
          items={authorizedConversations}
          locale={locale}
          onCollapsedChange={setHistoryCollapsed}
          onSelectConversation={(conversationId) => {
            setSelectedConversationId(conversationId);
            onSelectConversation?.(conversationId);
          }}
          {...(active?.conversationId === undefined
            ? {}
            : { activeConversationId: active.conversationId })}
          {...(onCreateConversation === undefined ? {} : { onCreate: onCreateConversation })}
        />
        <div className="analysis-page__thread-stage">
          {threadState === 'loading' ? (
            <section className="analysis-page__empty" role="status">
              <p>{text.threadLoading}</p>
            </section>
          ) : threadState === 'error' ? (
            <section className="analysis-page__empty" role="status">
              <p>{text.threadError}</p>
            </section>
          ) : active === undefined ? (
            <section className="analysis-page__empty" role="status">
              <p>{text.empty}</p>
            </section>
          ) : (
            <>
              {activeEvents.map((event) => (
                <ContextChangeEvent event={event} key={event.eventId} locale={locale} />
              ))}
              {turnErrorText === undefined ? null : (
                <p aria-label={turnErrorText} className="analysis-page__turn-error" role="alert">
                  {turnErrorText}
                </p>
              )}
              <ConversationThread
                conversation={active}
                locale={locale}
                {...(onSendMessage === undefined
                  ? {}
                  : {
                      onSendMessage: async (message: string) => {
                        await onSendMessage(message, active.conversationId);
                      },
                    })}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
