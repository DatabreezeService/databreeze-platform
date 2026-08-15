import { useId, useState, type FormEvent, type ReactNode, type Ref } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';

import type { AgentConversationSummaryV1, AgentMessagePresentationV1 } from './agent-store.ts';

function newConversationPath(analysisHref: string, explicitHref?: string): string {
  if (explicitHref !== undefined) return explicitHref;
  return `${analysisHref.split('?')[0] ?? analysisHref}?new=1`;
}

export interface AgentChatShellProperties {
  readonly activeConversationId?: string;
  readonly analysisHref: string;
  readonly children?: ReactNode;
  readonly composerLabel?: string;
  readonly context?: string;
  readonly conversations: readonly AgentConversationSummaryV1[];
  readonly locale: 'en' | 'vi-VN';
  readonly messages?: readonly AgentMessagePresentationV1[];
  readonly newConversationHref?: string;
  readonly onCreateConversation?: () => void;
  readonly onSelectConversation: (conversationId: string) => void;
  readonly onSubmitMessage?: (message: string) => void | Promise<void>;
  readonly stateMessage?: string;
  readonly stateTone?: 'status' | 'alert';
  readonly submitting?: boolean;
  readonly textareaRef?: Ref<HTMLTextAreaElement>;
}

/** WEB-024/DDA-055: one content-safe chat presentation shared by compact agent surfaces. */
export function AgentChatShell({
  activeConversationId,
  analysisHref,
  children,
  composerLabel,
  context,
  conversations,
  locale,
  messages = [],
  newConversationHref,
  onCreateConversation,
  onSelectConversation,
  onSubmitMessage,
  stateMessage,
  stateTone = 'status',
  submitting = false,
  textareaRef,
}: AgentChatShellProperties) {
  const [draft, setDraft] = useState('');
  const composerId = useId();
  const inRouter = useInRouterContext();
  const createHref = newConversationPath(analysisHref, newConversationHref);
  const text =
    locale === 'vi-VN'
      ? {
          analysis: 'Mở trong Phân tích',
          composer: composerLabel ?? 'Nhập câu hỏi cho trợ lý',
          empty: 'Chưa có tin nhắn trong hội thoại này.',
          inputPlaceholder: 'Hỏi về dữ liệu hoặc yêu cầu một biểu đồ…',
          newConversation: 'Hội thoại mới',
          noConversation: 'Chưa có hội thoại được cấp quyền.',
          send: submitting ? 'Đang gửi…' : 'Gửi',
          switchConversation: 'Chuyển hội thoại',
        }
      : {
          analysis: 'Open in Analysis',
          composer: composerLabel ?? 'Ask the agent',
          empty: 'There are no messages in this conversation yet.',
          inputPlaceholder: 'Ask about your data or request a chart…',
          newConversation: 'New conversation',
          noConversation: 'No authorized conversations are available.',
          send: submitting ? 'Sending…' : 'Send',
          switchConversation: 'Switch conversation',
        };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (message === '' || submitting || onSubmitMessage === undefined) return;
    try {
      await onSubmitMessage(message);
      setDraft('');
    } catch {
      // The caller owns localized failure copy. Preserve the draft for retry.
    }
  }

  return (
    <div className="agent-chat-shell">
      <div className="agent-chat-shell__toolbar">
        <label>
          <span>{text.switchConversation}</span>
          <select
            aria-label={text.switchConversation}
            disabled={conversations.length === 0}
            onChange={(event) => onSelectConversation(event.target.value)}
            value={activeConversationId ?? ''}
          >
            {activeConversationId === undefined ? (
              <option value="">
                {conversations.length === 0 ? text.noConversation : text.switchConversation}
              </option>
            ) : null}
            {conversations.map((conversation) => (
              <option key={conversation.conversationId} value={conversation.conversationId}>
                {conversation.title}
              </option>
            ))}
          </select>
        </label>
        {onCreateConversation === undefined ? (
          inRouter ? (
            <Link className="agent-chat-shell__new" to={createHref}>
              {text.newConversation}
            </Link>
          ) : (
            <a className="agent-chat-shell__new" href={createHref}>
              {text.newConversation}
            </a>
          )
        ) : (
          <button className="agent-chat-shell__new" onClick={onCreateConversation} type="button">
            {text.newConversation}
          </button>
        )}
      </div>

      {context === undefined ? null : <p className="agent-chat-shell__context">{context}</p>}

      <div aria-live="polite" className="agent-chat-shell__messages" role="log">
        {messages.length === 0 ? (
          <p className="agent-chat-shell__empty">{text.empty}</p>
        ) : (
          messages.map((message) => (
            <article
              className={`agent-chat-shell__message agent-chat-shell__message--${message.role.toLowerCase()}`}
              key={message.messageId}
            >
              <p>{message.text}</p>
              {message.createdLabel === undefined ? null : <time>{message.createdLabel}</time>}
            </article>
          ))
        )}
      </div>
      {children}

      {stateMessage === undefined ? null : (
        <p className="agent-chat-shell__state" role={stateTone}>
          {stateMessage}
        </p>
      )}

      <form className="agent-chat-shell__composer" onSubmit={(event) => void submit(event)}>
        <label htmlFor={composerId}>{text.composer}</label>
        <div>
          <textarea
            aria-label={text.composer}
            disabled={onSubmitMessage === undefined}
            id={composerId}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={text.inputPlaceholder}
            ref={textareaRef}
            rows={3}
            value={draft}
          />
          <button
            disabled={draft.trim() === '' || submitting || onSubmitMessage === undefined}
            type="submit"
          >
            {text.send}
          </button>
        </div>
      </form>

      {inRouter ? (
        <Link className="agent-chat-shell__analysis-link" to={analysisHref}>
          {text.analysis}
        </Link>
      ) : (
        <a className="agent-chat-shell__analysis-link" href={analysisHref}>
          {text.analysis}
        </a>
      )}
    </div>
  );
}
