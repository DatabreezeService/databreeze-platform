import { useRef, useState, type FormEvent } from 'react';
import brandMarkUrl from '@databreeze/design-tokens/brand/generated/web/favicon-32.png';

import type { AnalysisConversationV1 } from './analysis-model.ts';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        composer: 'Nhập câu hỏi phân tích',
        context: 'Ngữ cảnh dữ liệu',
        empty: 'Bắt đầu bằng một câu hỏi về dữ liệu của bạn.',
        identity: 'Trợ lý DataBreeze',
        protected: 'Chỉ dùng dữ liệu và công cụ bạn được cấp quyền',
        placeholder: 'Hỏi về dữ liệu đã chọn…',
        prompts: [
          ['Tóm tắt xu hướng chính', 'Tóm tắt các xu hướng chính trong dữ liệu này'],
          ['Tìm điểm bất thường', 'Tìm điểm bất thường trong dữ liệu này'],
          ['So sánh với kỳ trước', 'So sánh kết quả hiện tại với kỳ trước'],
        ] as const,
        send: 'Gửi câu hỏi',
        unavailable: 'Chưa có lệnh gửi được ủy quyền cho hội thoại này.',
      }
    : {
        composer: 'Enter an analysis question',
        context: 'Dataset context',
        empty: 'No authorized messages are available in this conversation.',
        identity: 'DataBreeze Agent',
        protected: 'Uses only data and tools you are authorized to access',
        placeholder: 'Ask about the selected data…',
        prompts: [
          ['Summarize key trends', 'Summarize the key trends in this data'],
          ['Find anomalies', 'Find anomalies in this data'],
          ['Compare with prior period', 'Compare the current result with the prior period'],
        ] as const,
        send: 'Send question',
        unavailable: 'No authorized send command is available for this conversation.',
      };
}

function messageRoleLabel(locale: 'en' | 'vi-VN', role: 'USER' | 'AGENT' | 'SYSTEM'): string {
  if (locale === 'vi-VN') {
    return role === 'USER' ? 'Bạn' : role === 'AGENT' ? 'Trợ lý' : 'Hệ thống';
  }
  return role === 'USER' ? 'You' : role === 'AGENT' ? 'Agent' : 'System';
}

export interface ConversationThreadProps {
  readonly conversation: AnalysisConversationV1;
  readonly locale: 'en' | 'vi-VN';
  readonly onSendMessage?: (message: string) => void | Promise<void>;
}

/** DDA-055: renders only message records supplied by the authorized conversation loader. */
export function ConversationThread({
  conversation,
  locale,
  onSendMessage,
}: ConversationThreadProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const text = copy(locale);
  const canSend = onSendMessage !== undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = draft.trim();
    if (normalized === '' || !canSend || sending) return;
    setSending(true);
    try {
      await onSendMessage(normalized);
      setDraft('');
    } catch {
      // The parent owns localized, permission-safe failure copy. Preserve the
      // draft so the user can retry after authority or context is corrected.
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      aria-label={locale === 'vi-VN' ? 'Luồng hội thoại' : 'Conversation thread'}
      className="analysis-conversation-thread"
    >
      <header className="analysis-conversation-thread__header">
        <div className="analysis-conversation-thread__identity">
          <span className="analysis-conversation-thread__avatar">
            <img alt="" aria-hidden="true" src={brandMarkUrl} />
          </span>
          <div>
            <h2>{text.identity}</h2>
            <p>{text.protected}</p>
          </div>
        </div>
        <div>
          <h3>{conversation.title}</h3>
          {conversation.datasetContext.length === 0 ? null : (
            <dl aria-label={text.context} className="analysis-conversation-thread__context">
              {conversation.datasetContext.map((context) => (
                <div key={`${context.datasetLabel}:${context.datasetVersionLabel}`}>
                  <dt>{context.datasetLabel}</dt>
                  <dd>{context.datasetVersionLabel}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </header>
      {conversation.messages.length === 0 ? (
        <section className="analysis-conversation-thread__empty">
          <p>{text.empty}</p>
          <div className="analysis-conversation-thread__prompts">
            {text.prompts.map(([label, prompt]) => (
              <button
                key={label}
                onClick={() => {
                  setDraft(prompt);
                  composerRef.current?.focus();
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <ol className="analysis-conversation-thread__messages">
          {conversation.messages.map((message) => (
            <li
              className={`analysis-conversation-thread__message is-${message.role.toLowerCase()}`}
              key={message.messageId}
            >
              <span className="analysis-conversation-thread__message-role">
                {messageRoleLabel(locale, message.role)}
              </span>
              <p>{message.text}</p>
              {message.createdLabel === undefined ? null : <time>{message.createdLabel}</time>}
            </li>
          ))}
        </ol>
      )}
      <form
        className="analysis-conversation-thread__composer"
        onSubmit={(event) => void submit(event)}
      >
        <label className="sr-only" htmlFor={`analysis-composer-${conversation.conversationId}`}>
          {text.composer}
        </label>
        <textarea
          disabled={!canSend || sending}
          id={`analysis-composer-${conversation.conversationId}`}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={text.placeholder}
          ref={composerRef}
          rows={3}
          value={draft}
        />
        <div>
          <button disabled={!canSend || sending || draft.trim() === ''} type="submit">
            {text.send}
          </button>
          {canSend ? null : <span>{text.unavailable}</span>}
        </div>
      </form>
    </section>
  );
}
