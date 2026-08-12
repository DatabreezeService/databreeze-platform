import type { AgentStoreV1 } from '../agent/agent-store.ts';
import { ConversationHistory } from './conversation-history.tsx';
import { ConversationThread } from './conversation-thread.tsx';
import { ContextChangeEvent } from './context-change-event.tsx';

export function AnalysisPage({
  locale,
  store,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly store: AgentStoreV1;
}) {
  const active = store.getActiveConversation();
  return (
    <main className="analysis-page">
      <h1>{locale === 'vi-VN' ? 'Phân tích' : 'Analysis'}</h1>
      <ConversationHistory
        locale={locale}
        items={
          active
            ? [
                {
                  conversationId: active.conversationId,
                  title: active.title,
                  datasetLabel: active.datasetLabel,
                  datasetVersionLabel: active.datasetVersionLabel,
                },
              ]
            : []
        }
      />
      {active ? (
        <>
          <ContextChangeEvent
            locale={locale}
            fromVersion="phiên bản 7"
            toVersion="phiên bản 8"
          />
          <ConversationThread locale={locale} title={active.title} />
        </>
      ) : null}
    </main>
  );
}
