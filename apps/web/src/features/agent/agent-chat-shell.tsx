import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';

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
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const composerId = useId();
  const conversationMenuId = useId();
  const conversationSelectorRef = useRef<HTMLDivElement>(null);
  const conversationTriggerRef = useRef<HTMLButtonElement>(null);
  const conversationMenuRef = useRef<HTMLDivElement>(null);

  const text =
    locale === 'vi-VN'
      ? {
          close: 'Đóng trợ lý',
          composer: composerLabel ?? 'Nhập câu hỏi cho trợ lý',
          composerHint: 'Enter để gửi · Shift+Enter để xuống dòng',
          emptyGreeting: 'Tôi có thể giúp gì cho bạn hôm nay?',
          emptyHint: 'Chọn một hội thoại hoặc bắt đầu bằng câu hỏi bên dưới.',
          inputPlaceholder: 'Hỏi bất kỳ điều gì với AI…',
          newConversation: 'Cuộc trò chuyện mới',
          noConversation: 'Chưa có hội thoại được cấp quyền',
          send: submitting ? 'Đang gửi…' : 'Gửi',
          switchConversation: 'Lịch sử hội thoại',
          suggestions: [
            {
              label: 'Tóm tắt các chỉ số đang hiển thị',
              prompt: 'Tóm tắt các chỉ số và điểm đáng chú ý đang hiển thị',
            },
            {
              label: 'Phân tích xu hướng doanh thu',
              prompt: 'Phân tích xu hướng doanh thu và các yếu tố đang ảnh hưởng',
            },
            {
              label: 'Kiểm tra chất lượng dữ liệu',
              prompt: 'Kiểm tra chất lượng dữ liệu và nêu các điểm cần xem lại',
            },
          ],
        }
      : {
          close: 'Close agent',
          composer: composerLabel ?? 'Ask the agent',
          composerHint: 'Enter to send · Shift+Enter for a new line',
          emptyGreeting: 'How can I help you today?',
          emptyHint: 'Choose a conversation or start with a question below.',
          inputPlaceholder: 'Do anything with AI…',
          newConversation: 'New conversation',
          noConversation: 'No authorized conversations are available',
          send: submitting ? 'Sending…' : 'Send',
          switchConversation: 'Conversation history',
          suggestions: [
            {
              label: 'Summarize the metrics on screen',
              prompt: 'Summarize the metrics and notable changes on screen',
            },
            {
              label: 'Analyze revenue trends',
              prompt: 'Analyze revenue trends and the factors driving them',
            },
            {
              label: 'Check data quality',
              prompt: 'Check data quality and call out anything that needs review',
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
    setConversationMenuOpen(false);
    if (val === '') {
      if (onCreateConversation) onCreateConversation();
      else onSelectConversation('');
    } else {
      onSelectConversation(val);
    }
    conversationTriggerRef.current?.focus();
  }

  function openConversationMenu() {
    setConversationMenuOpen(true);
  }

  function handleConversationTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openConversationMenu();
      return;
    }
    if (event.key === 'Escape') setConversationMenuOpen(false);
  }

  function handleConversationMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setConversationMenuOpen(false);
      conversationTriggerRef.current?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const options = Array.from(
      conversationMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    const currentIndex = options.indexOf(event.target as HTMLButtonElement);
    const nextIndex =
      event.key === 'ArrowDown'
        ? Math.min(currentIndex + 1, options.length - 1)
        : Math.max(currentIndex - 1, 0);
    options[nextIndex]?.focus();
  }

  useEffect(() => {
    if (!conversationMenuOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!conversationSelectorRef.current?.contains(event.target as Node)) {
        setConversationMenuOpen(false);
      }
    };
    globalThis.document.addEventListener('pointerdown', handlePointerDown);
    return () => globalThis.document.removeEventListener('pointerdown', handlePointerDown);
  }, [conversationMenuOpen]);

  useEffect(() => {
    if (!conversationMenuOpen) return;
    conversationMenuRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
  }, [conversationMenuOpen]);

  const activeConversation = conversations.find((c) => c.conversationId === activeConversationId);
  const currentTitle = activeConversation?.title ?? text.newConversation;

  return (
    <div className="notion-ai-chat">
      {/* Accessible heading for screen readers */}
      <h2 className="dda-sr-only">{headingTitle ?? 'Trợ lý DataBreeze'}</h2>

      {/* History-first header: the only navigation control is the conversation history. */}
      <header className="notion-ai-header">
        <div className="notion-ai-header__selector" ref={conversationSelectorRef}>
          <button
            aria-controls={conversationMenuId}
            aria-expanded={conversationMenuOpen}
            aria-haspopup="listbox"
            aria-label={text.switchConversation}
            className="notion-ai-header__trigger"
            onClick={() => setConversationMenuOpen((open) => !open)}
            onKeyDown={handleConversationTriggerKeyDown}
            ref={conversationTriggerRef}
            type="button"
          >
            <span className="notion-ai-header__display-title">
              <span className="notion-ai-header__current-title">{currentTitle}</span>
              <svg
                aria-hidden="true"
                className="notion-ai-header__chevron"
                fill="none"
                height="14"
                viewBox="0 0 24 24"
                width="14"
              >
                <path
                  d="m6 9 6 6 6-6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </span>
          </button>
          {conversationMenuOpen ? (
            <div
              aria-label={text.switchConversation}
              className="notion-ai-header__menu"
              id={conversationMenuId}
              onKeyDown={handleConversationMenuKeyDown}
              ref={conversationMenuRef}
              role="listbox"
            >
              <button
                aria-selected={activeConversationId === undefined}
                className="notion-ai-header__option"
                onClick={() => handleSelectChange('')}
                role="option"
                type="button"
              >
                <span>{text.newConversation}</span>
                {activeConversationId === undefined ? (
                  <span aria-hidden="true" className="notion-ai-header__option-check">
                    ✓
                  </span>
                ) : null}
              </button>
              {conversations.map((conv) => {
                const selected = conv.conversationId === activeConversationId;
                return (
                  <button
                    aria-selected={selected}
                    className="notion-ai-header__option"
                    key={conv.conversationId}
                    onClick={() => handleSelectChange(conv.conversationId)}
                    role="option"
                    type="button"
                  >
                    <span className="notion-ai-header__option-title">{conv.title}</span>
                    {selected ? (
                      <span aria-hidden="true" className="notion-ai-header__option-check">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {conversations.length === 0 ? (
                <p className="notion-ai-header__menu-empty">{text.noConversation}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="notion-ai-header__actions">
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
      {context !== undefined ? (
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
            <p className="notion-ai-empty__hint">{text.emptyHint}</p>
            <div className="notion-ai-empty__suggestions">
              {text.suggestions.map((item) => (
                <button
                  className="notion-ai-empty__suggestion-item"
                  key={item.prompt}
                  onClick={() => {
                    if (onSubmitMessage) void onSubmitMessage(item.prompt);
                    else setDraft(item.prompt);
                  }}
                  type="button"
                >
                  <span className="notion-ai-empty__suggestion-label">{item.label}</span>
                  <span aria-hidden="true" className="notion-ai-empty__suggestion-arrow">
                    →
                  </span>
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
                  {message.createdLabel !== undefined ? <time>{message.createdLabel}</time> : null}
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
            <span className="notion-ai-composer__hint">{text.composerHint}</span>
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
      </form>
    </div>
  );
}
