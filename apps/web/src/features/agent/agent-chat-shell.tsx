import { useId, useState, type FormEvent, type ReactNode, type Ref } from 'react';

import { DATABREEZE_MARK_SRC } from '../../app/brand-assets.ts';
import { XIcon } from '../../components/icons.tsx';
import type { AgentConversationSummaryV1, AgentMessagePresentationV1 } from './agent-store.ts';

export interface AgentChatShellProperties {
  readonly activeConversationId?: string;
  readonly analysisHref?: string;
  readonly children?: ReactNode;
  readonly composerLabel?: string;
  readonly context?: string;
  readonly conversations: readonly AgentConversationSummaryV1[];
  readonly headingTitle?: string;
  readonly locale: 'en' | 'vi-VN';
  readonly messages?: readonly AgentMessagePresentationV1[];
  readonly newConversationHref?: string;
  readonly onClose?: () => void;
  readonly onCreateConversation?: () => void;
  readonly onSelectConversation: (conversationId: string) => void;
  readonly onSubmitMessage?: (message: string) => void | Promise<void>;
  readonly stateMessage?: string;
  readonly stateTone?: 'status' | 'alert';
  readonly submitting?: boolean;
  readonly textareaRef?: Ref<HTMLTextAreaElement>;
}

/** WEB-024/DDA-055: Notion-style seamless AI chat presentation. */
export function AgentChatShell({
  activeConversationId,
  children,
  composerLabel,
  context,
  conversations,
  headingTitle,
  locale,
  messages = [],
  onClose,
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

  const text =
    locale === 'vi-VN'
      ? {
          close: 'Đóng trợ lý',
          composer: composerLabel ?? 'Nhập câu hỏi cho trợ lý',
          emptyGreeting: 'Tôi có thể giúp gì cho bạn hôm nay?',
          inputPlaceholder: 'Hỏi bất kỳ điều gì với AI…',
          newAiChat: 'Cuộc trò chuyện mới',
          noConversation: 'Chưa có hội thoại được cấp quyền',
          send: submitting ? 'Đang gửi…' : 'Gửi',
          switchConversation: 'Chuyển hội thoại',
          suggestions: [
            {
              icon: '🐥',
              label: 'Cá nhân hóa trợ lý DataBreeze AI',
              prompt: 'Tùy chỉnh phong cách phân tích dữ liệu cho trợ lý AI',
            },
            {
              icon: '📊',
              label: 'Tạo biểu đồ trực quan hóa dữ liệu',
              prompt: 'Tạo biểu đồ trực quan hóa từ các chỉ số kinh doanh chính',
              badge: 'Mới',
            },
            {
              icon: '📈',
              label: 'Phân tích doanh thu & xu hướng tăng trưởng',
              prompt: 'Phân tích tổng quan doanh thu Q2 và dự báo xu hướng tiếp theo',
            },
            {
              icon: '🔍',
              label: 'Kiểm tra chất lượng & tính toàn vẹn dữ liệu',
              prompt: 'Kiểm tra tính hợp lệ và cảnh báo bất thường trong dữ liệu',
            },
            {
              icon: '📄',
              label: 'Tóm tắt thông tin trên màn hình này',
              prompt: 'Tóm tắt nhanh các chỉ số và dữ liệu đang hiển thị',
            },
          ],
        }
      : {
          close: 'Close agent',
          composer: composerLabel ?? 'Ask the agent',
          emptyGreeting: 'How can I help you today?',
          inputPlaceholder: 'Do anything with AI…',
          newAiChat: 'New AI chat',
          noConversation: 'No authorized conversations are available',
          send: submitting ? 'Sending…' : 'Send',
          switchConversation: 'Switch conversation',
          suggestions: [
            {
              icon: '🐥',
              label: 'Personalize your DataBreeze AI',
              prompt: 'Personalize the analysis style and focus metrics for AI',
            },
            {
              icon: '📊',
              label: 'Create a diagram based on data',
              prompt: 'Generate an interactive visualization for primary metrics',
              badge: 'New',
            },
            {
              icon: '📈',
              label: 'Analyze revenue & growth trends',
              prompt: 'Summarize Q2 revenue KPIs and identify key trend drivers',
            },
            {
              icon: '🔍',
              label: 'Verify data quality & pipelines',
              prompt: 'Audit dataset freshness and detect schema anomalies',
            },
            {
              icon: '📄',
              label: 'Summarize this page',
              prompt: 'Provide a concise executive summary of this view',
            },
          ],
        };

  async function submit(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    const message = draft.trim();
    if (message === '' || submitting || onSubmitMessage === undefined) return;
    try {
      await onSubmitMessage(message);
      setDraft('');
    } catch {
      // The caller owns localized failure copy. Preserve the draft for retry.
    }
  }

  function handleSelectChange(val: string) {
    if (val === '') {
      if (onCreateConversation) onCreateConversation();
      else onSelectConversation('');
    } else {
      onSelectConversation(val);
    }
  }

  const activeConversation = conversations.find(
    (c) => c.conversationId === activeConversationId,
  );
  const currentTitle = activeConversation?.title ?? text.newAiChat;

  return (
    <div className="notion-ai-chat">
      {/* Accessible heading for screen readers */}
      <h2 className="dda-sr-only">{headingTitle ?? 'Trợ lý DataBreeze'}</h2>

      {/* Notion-style Top Bar */}
      <header className="notion-ai-header">
        <div className="notion-ai-header__selector">
          <select
            aria-label={text.switchConversation}
            className="notion-ai-header__select"
            onChange={(event) => handleSelectChange(event.target.value)}
            value={activeConversationId ?? ''}
          >
            <option value="">{text.newAiChat}</option>
            {conversations.map((conv) => (
              <option key={conv.conversationId} value={conv.conversationId}>
                {conv.title}
              </option>
            ))}
          </select>
          <span className="notion-ai-header__display-title" aria-hidden="true">
            {currentTitle} <span className="notion-ai-header__chevron">▾</span>
          </span>
        </div>

        <div className="notion-ai-header__actions">
          {onCreateConversation !== undefined && (
            <button
              aria-label={text.newAiChat}
              className="notion-ai-header__icon-btn"
              onClick={onCreateConversation}
              title={text.newAiChat}
              type="button"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
          {onClose !== undefined && (
            <button
              aria-label={text.close}
              className="notion-ai-header__icon-btn"
              onClick={onClose}
              title={text.close}
              type="button"
            >
              <XIcon />
            </button>
          )}
        </div>
      </header>

      {/* Context Badge if attached */}
      {context !== undefined && activeConversationId !== undefined ? (
        <div className="notion-ai-context">
          <span>{context}</span>
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="notion-ai-body">
        {messages.length === 0 ? (
          <div className="notion-ai-empty">
            <div className="notion-ai-empty__avatar">
              <img alt="DataBreeze AI" src={DATABREEZE_MARK_SRC} />
            </div>
            <h3 className="notion-ai-empty__greeting">{text.emptyGreeting}</h3>
            <div className="notion-ai-empty__suggestions">
              {text.suggestions.map((item, idx) => (
                <button
                  className="notion-ai-empty__suggestion-item"
                  key={idx}
                  onClick={() => {
                    if (onSubmitMessage) void onSubmitMessage(item.prompt);
                    else setDraft(item.prompt);
                  }}
                  type="button"
                >
                  <span className="notion-ai-empty__suggestion-icon">{item.icon}</span>
                  <span className="notion-ai-empty__suggestion-label">{item.label}</span>
                  {item.badge ? (
                    <span className="notion-ai-empty__suggestion-badge">{item.badge}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div aria-live="polite" className="notion-ai-messages" role="log">
            {messages.map((message) => (
              <article
                className={`notion-ai-message notion-ai-message--${message.role.toLowerCase()}`}
                key={message.messageId}
              >
                {message.role === 'ASSISTANT' ? (
                  <div aria-hidden="true" className="notion-ai-message__avatar">
                    <img alt="" src={DATABREEZE_MARK_SRC} />
                  </div>
                ) : null}
                <div className="notion-ai-message__content">
                  <p>{message.text}</p>
                  {message.createdLabel !== undefined ? (
                    <time>{message.createdLabel}</time>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}

        {children}

        {stateMessage !== undefined ? (
          <p className="notion-ai-state" role={stateTone}>
            {stateMessage}
          </p>
        ) : null}
      </div>

      {/* Notion-style Composer */}
      <form className="notion-ai-composer" onSubmit={(event) => void submit(event)}>
        <label className="dda-sr-only" htmlFor={composerId}>
          {text.composer}
        </label>
        <div className="notion-ai-composer__box">
          <textarea
            aria-label={text.composer}
            disabled={onSubmitMessage === undefined}
            id={composerId}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={text.inputPlaceholder}
            ref={textareaRef}
            rows={1}
            value={draft}
          />
          <div className="notion-ai-composer__footer">
            <div className="notion-ai-composer__left-tools">
              <button
                aria-label="Thêm ngữ cảnh"
                className="notion-ai-composer__tool-btn"
                title="Thêm ngữ cảnh"
                type="button"
              >
                <span aria-hidden="true">+</span>
              </button>
              <button
                aria-label="Tùy chỉnh"
                className="notion-ai-composer__tool-btn"
                title="Tùy chỉnh"
                type="button"
              >
                <svg
                  fill="none"
                  height="14"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="14"
                >
                  <line x1="4" x2="4" y1="21" y2="14" />
                  <line x1="4" x2="4" y1="10" y2="3" />
                  <line x1="12" x2="12" y1="21" y2="12" />
                  <line x1="12" x2="12" y1="8" y2="3" />
                  <line x1="20" x2="20" y1="21" y2="16" />
                  <line x1="20" x2="20" y1="12" y2="3" />
                  <line x1="1" x2="7" y1="14" y2="14" />
                  <line x1="9" x2="15" y1="8" y2="8" />
                  <line x1="17" x2="23" y1="16" y2="16" />
                </svg>
              </button>
            </div>
            <div className="notion-ai-composer__right-tools">
              <span className="notion-ai-composer__model-badge">Auto</span>
              <button
                aria-label="Ghi âm"
                className="notion-ai-composer__tool-btn"
                title="Ghi âm"
                type="button"
              >
                <svg
                  fill="none"
                  height="14"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="14"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </button>
              <button
                aria-label={text.send}
                className="notion-ai-composer__send-btn"
                disabled={draft.trim() === '' || submitting || onSubmitMessage === undefined}
                type="submit"
              >
                <span aria-hidden="true">↑</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
