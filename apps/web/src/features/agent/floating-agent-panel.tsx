import { useSyncExternalStore } from 'react';

import { DATABREEZE_MARK_SRC } from '../../app/brand-assets.ts';
import { XIcon } from '../../components/icons.tsx';
import { AgentChatShell } from './agent-chat-shell.tsx';
import type { AgentStoreV1 } from './agent-store.ts';

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
  const active = snapshot.activeConversation;
  const text =
    locale === 'vi-VN'
      ? {
          close: 'Đóng trợ lý',
          context: 'Đang dùng ngữ cảnh được cấp quyền',
          continue: 'Mở trong Phân tích',
          empty: 'Mở Phân tích để bắt đầu một hội thoại được gắn với dữ liệu của bạn.',
          title: 'Trợ lý DataBreeze',
        }
      : {
          close: 'Close agent',
          context: 'Using authorized context',
          continue: 'Open in Analysis',
          empty: 'Open Analysis to start a conversation bound to your data.',
          title: 'DataBreeze Agent',
        };
  return (
    <aside aria-label={locale === 'vi-VN' ? 'Trợ lý' : 'Agent'} className="floating-agent-panel">
      <header className="floating-agent-panel__header">
        <span className="floating-agent-panel__mark">
          <img alt="" aria-hidden="true" src={DATABREEZE_MARK_SRC} />
        </span>
        <div>
          <h2>{text.title}</h2>
          <p>{text.context}</p>
        </div>
        <button aria-label={text.close} type="button" onClick={() => store.setOpen(false)}>
          <XIcon />
        </button>
      </header>
      {active === undefined ? <p className="floating-agent-panel__empty">{text.empty}</p> : null}
      <AgentChatShell
        {...(active === undefined
          ? {}
          : {
              activeConversationId: active.conversationId,
              context: `${active.datasetLabel} · ${active.datasetVersionLabel}`,
            })}
        analysisHref={`/${locale}/analysis${active === undefined ? '' : `?conversation=${encodeURIComponent(active.conversationId)}`}`}
        conversations={snapshot.conversations}
        locale={locale}
        messages={active?.messages ?? []}
        newConversationHref={`/${locale}/analysis?new=1`}
        onSelectConversation={(conversationId) => store.selectConversation(conversationId)}
      />
    </aside>
  );
}
