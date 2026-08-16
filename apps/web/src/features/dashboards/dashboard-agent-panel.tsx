import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { XIcon } from '../../components/icons.tsx';
import { AgentChatShell } from '../agent/agent-chat-shell.tsx';
import type {
  AgentConversationSummaryV1,
  AgentMessagePresentationV1,
} from '../agent/agent-store.ts';
import {
  ChartProposalPicker,
  type DashboardChartProposalOptionV1,
} from './chart-proposal-picker.tsx';

export interface DashboardAgentLocalizedTextV1 {
  readonly vi: string;
  readonly en: string;
}

export interface DashboardAgentTargetV1 {
  readonly pageId: string;
  readonly pageTitle: DashboardAgentLocalizedTextV1;
  readonly widgetId?: string;
  readonly widgetTitle?: DashboardAgentLocalizedTextV1;
}

export type DashboardAgentResponseV1 =
  | {
      readonly kind: 'proposals';
      readonly proposalId?: string;
      readonly options: readonly DashboardChartProposalOptionV1[];
    }
  | { readonly kind: 'clarification'; readonly message: DashboardAgentLocalizedTextV1 }
  | { readonly kind: 'provider-disabled'; readonly message?: DashboardAgentLocalizedTextV1 }
  | { readonly kind: 'conflict'; readonly message?: DashboardAgentLocalizedTextV1 }
  | { readonly kind: 'error'; readonly message?: DashboardAgentLocalizedTextV1 };

export interface DashboardAgentPanelProps {
  readonly activeConversationId?: string;
  readonly confirmingProposal?: boolean;
  readonly conversations?: readonly AgentConversationSummaryV1[];
  readonly locale: SupportedLocaleV1;
  readonly manualFallback?: ReactNode;
  readonly messages?: readonly AgentMessagePresentationV1[];
  readonly onClose: () => void;
  readonly onConfirmProposal?: (selectedOptionIds: readonly string[]) => void | Promise<void>;
  readonly onCreateConversation?: () => void;
  readonly onSelectConversation?: (conversationId: string) => void;
  readonly onSubmitQuestion?: (
    question: string,
    target: DashboardAgentTargetV1,
  ) => DashboardAgentResponseV1 | void | Promise<DashboardAgentResponseV1 | void>;
  readonly onUseManualPlan?: () => void;
  readonly open: boolean;
  readonly proposalOptions?: readonly DashboardChartProposalOptionV1[];
  readonly response?: DashboardAgentResponseV1;
  readonly target: DashboardAgentTargetV1;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'));
}

/** DDA-015/DDA-017/DDA-024: focus-managed agent chat with explicit governed proposals. */
export function DashboardAgentPanel({
  activeConversationId,
  confirmingProposal,
  conversations = [],
  locale,
  manualFallback,
  messages = [],
  onClose,
  onConfirmProposal,
  onCreateConversation,
  onSelectConversation = () => undefined,
  onSubmitQuestion,
  onUseManualPlan,
  open,
  proposalOptions,
  response: responseFromParent,
  target,
}: DashboardAgentPanelProps) {
  const [response, setResponse] = useState<DashboardAgentResponseV1 | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(open);
  const titleId = useId();

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const active = globalThis.document.activeElement;
      priorFocusRef.current = active instanceof HTMLElement ? active : null;
      questionRef.current?.focus();
    }
    if (!open && wasOpenRef.current) priorFocusRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  if (!open) return null;

  const localizedKey = locale === 'vi-VN' ? 'vi' : 'en';
  const targetText = target.widgetTitle
    ? `${target.pageTitle[localizedKey]} · ${target.widgetTitle[localizedKey]}`
    : target.pageTitle[localizedKey];
  const activeResponse = responseFromParent ?? response;
  const activeOptions =
    proposalOptions ?? (activeResponse?.kind === 'proposals' ? activeResponse.options : undefined);
  const activeMessage =
    activeResponse !== undefined && activeResponse.kind !== 'proposals'
      ? activeResponse.message?.[localizedKey]
      : undefined;

  function stateMessage(): string | undefined {
    if (submitting) {
      return label(
        locale,
        'Đang phân tích ngữ cảnh và chuẩn bị biểu đồ tương thích…',
        'Analyzing context and preparing compatible charts…',
      );
    }
    if (activeResponse?.kind === 'clarification') {
      return (
        activeMessage ??
        label(
          locale,
          'Cần làm rõ yêu cầu trước khi đề xuất.',
          'A clarification is required before proposing charts.',
        )
      );
    }
    if (activeResponse?.kind === 'provider-disabled') {
      return (
        activeMessage ??
        label(
          locale,
          'Trợ lý AI hiện không khả dụng. Bạn vẫn có thể tạo kế hoạch phân tích có kiểm soát thủ công.',
          'The AI assistant is currently unavailable. You can still create a governed manual analysis plan.',
        )
      );
    }
    if (activeResponse?.kind === 'conflict') {
      return (
        activeMessage ??
        label(
          locale,
          'Bảng điều khiển đã thay đổi. Hãy xem lại đề xuất với phiên bản hiện tại trước khi xác nhận.',
          'The dashboard changed. Review the proposal against the current version before confirming.',
        )
      );
    }
    if (activeResponse?.kind === 'error') {
      return (
        activeMessage ??
        label(
          locale,
          'Không thể tạo đề xuất biểu đồ. Không có thay đổi nào được gửi.',
          'Chart proposals could not be created. No changes were sent.',
        )
      );
    }
    return undefined;
  }

  const nonAnswer =
    activeResponse?.kind === 'provider-disabled' ||
    activeResponse?.kind === 'error' ||
    activeResponse?.kind === 'conflict';
  const currentStateMessage = stateMessage();

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const container = dialogRef.current;
    if (container === null) return;
    const elements = focusableElements(container);
    if (elements.length === 0) return;
    const first = elements[0]!;
    const last = elements[elements.length - 1]!;
    if (event.shiftKey && globalThis.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submitQuestion(question: string) {
    if (submitting) return;
    if (onSubmitQuestion === undefined) {
      setResponse({ kind: 'provider-disabled' });
      return;
    }
    setSubmitting(true);
    setResponse(undefined);
    try {
      const nextResponse = await onSubmitQuestion(question, target);
      setResponse(nextResponse === undefined ? undefined : nextResponse);
    } catch {
      setResponse({ kind: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside
      aria-labelledby={titleId}
      aria-modal="true"
      className="dda-dashboard-agent-panel"
      onKeyDown={onKeyDown}
      ref={dialogRef}
      role="dialog"
    >
      <header className="dda-dashboard-agent-panel__header">
        <div>
          <p className="dda-dashboard-agent-panel__eyebrow">DataBreeze Agent</p>
          <h2 id={titleId}>{label(locale, 'Trợ lý biểu đồ', 'Chart assistant')}</h2>
        </div>
        <button
          aria-label={label(locale, 'Đóng trợ lý biểu đồ', 'Close chart assistant')}
          onClick={onClose}
          type="button"
        >
          <XIcon />
        </button>
      </header>

      <AgentChatShell
        {...(currentStateMessage === undefined ? {} : { stateMessage: currentStateMessage })}
        {...(activeConversationId === undefined ? {} : { activeConversationId })}
        {...(onCreateConversation === undefined ? {} : { onCreateConversation })}
        analysisHref={`/${locale}/analysis${activeConversationId === undefined ? '' : `?conversation=${encodeURIComponent(activeConversationId)}`}`}
        composerLabel={label(
          locale,
          'Câu hỏi cho trợ lý biểu đồ',
          'Question for the chart assistant',
        )}
        context={`${label(locale, 'Mục tiêu', 'Target')}: ${targetText}`}
        conversations={conversations}
        locale={locale}
        messages={messages}
        newConversationHref={`/${locale}/analysis?new=1`}
        onSelectConversation={onSelectConversation}
        onSubmitMessage={submitQuestion}
        stateTone={nonAnswer ? 'alert' : 'status'}
        submitting={submitting}
        textareaRef={questionRef}
      >
        {nonAnswer ? (
          <section
            aria-label={label(locale, 'Phương án thủ công', 'Manual alternative')}
            className="dda-dashboard-agent-panel__manual"
          >
            {onUseManualPlan === undefined ? null : (
              <button onClick={onUseManualPlan} type="button">
                {label(locale, 'Xem kế hoạch phân tích thủ công', 'View manual analysis plan')}
              </button>
            )}
            {manualFallback}
          </section>
        ) : null}
        {activeOptions !== undefined && onConfirmProposal !== undefined ? (
          <ChartProposalPicker
            key={
              activeResponse?.kind === 'proposals'
                ? activeResponse.proposalId
                : activeOptions.map((option) => option.optionId).join('|')
            }
            {...(confirmingProposal === undefined ? {} : { confirming: confirmingProposal })}
            locale={locale}
            onConfirm={onConfirmProposal}
            options={activeOptions}
          />
        ) : null}
      </AgentChatShell>
    </aside>
  );
}
