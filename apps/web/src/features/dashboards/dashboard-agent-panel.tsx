import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

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
  readonly locale: SupportedLocaleV1;
  readonly open: boolean;
  readonly target: DashboardAgentTargetV1;
  readonly onClose: () => void;
  readonly onSubmitQuestion?: (
    question: string,
    target: DashboardAgentTargetV1,
  ) => DashboardAgentResponseV1 | void | Promise<DashboardAgentResponseV1 | void>;
  readonly response?: DashboardAgentResponseV1;
  readonly proposalOptions?: readonly DashboardChartProposalOptionV1[];
  readonly onConfirmProposal?: (selectedOptionIds: readonly string[]) => void | Promise<void>;
  readonly manualFallback?: ReactNode;
  readonly onUseManualPlan?: () => void;
  readonly confirmingProposal?: boolean;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'));
}

/** DDA-015/DDA-017/DDA-024: focus-managed dashboard-local question panel. */
export function DashboardAgentPanel({
  locale,
  open,
  target,
  onClose,
  onSubmitQuestion,
  response: responseFromParent,
  proposalOptions,
  onConfirmProposal,
  manualFallback,
  onUseManualPlan,
  confirmingProposal,
}: DashboardAgentPanelProps) {
  const [question, setQuestion] = useState('');
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
    if (!open && wasOpenRef.current) {
      priorFocusRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  if (!open) return null;

  const targetText = target.widgetTitle
    ? `${target.pageTitle[locale === 'vi-VN' ? 'vi' : 'en']} · ${target.widgetTitle[locale === 'vi-VN' ? 'vi' : 'en']}`
    : target.pageTitle[locale === 'vi-VN' ? 'vi' : 'en'];

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const container = dialogRef.current;
    if (!container) return;
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = question.trim();
    if (normalized === '' || submitting) return;
    if (onSubmitQuestion === undefined) {
      setResponse({ kind: 'provider-disabled' });
      return;
    }
    setSubmitting(true);
    setResponse(undefined);
    try {
      const nextResponse = await onSubmitQuestion(normalized, target);
      if (nextResponse === undefined) setResponse(undefined);
      else setResponse(nextResponse);
    } catch {
      setResponse({ kind: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  const activeResponse = responseFromParent ?? response;
  const activeOptions =
    proposalOptions ?? (activeResponse?.kind === 'proposals' ? activeResponse.options : undefined);
  const activeMessage =
    activeResponse !== undefined && activeResponse.kind !== 'proposals'
      ? activeResponse.message?.[locale === 'vi-VN' ? 'vi' : 'en']
      : undefined;

  function stateMessage(): string | undefined {
    if (submitting) {
      return label(
        locale,
        'Đang chuẩn bị đề xuất biểu đồ tương thích…',
        'Preparing compatible chart proposals…',
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

  return (
    <aside
      ref={dialogRef}
      className="dda-dashboard-agent-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <header className="dda-dashboard-agent-panel__header">
        <div>
          <p className="dda-dashboard-agent-panel__eyebrow">
            {label(locale, 'Trợ lý biểu đồ', 'Chart assistant')}
          </p>
          <h2 id={titleId}>{label(locale, 'Trợ lý biểu đồ', 'Chart assistant')}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={label(locale, 'Đóng trợ lý biểu đồ', 'Close chart assistant')}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <p className="dda-dashboard-agent-panel__target">
        {label(locale, 'Mục tiêu', 'Target')}: {targetText}
      </p>
      <form
        className="dda-dashboard-agent-panel__question"
        onSubmit={(event) => void submit(event)}
      >
        <label htmlFor={`${titleId}-question`}>
          {label(locale, 'Câu hỏi cho trợ lý biểu đồ', 'Question for the chart assistant')}
        </label>
        <textarea
          ref={questionRef}
          id={`${titleId}-question`}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={label(
            locale,
            'Ví dụ: Doanh thu theo sản phẩm và khu vực',
            'For example: Revenue by product and region',
          )}
          rows={3}
        />
        <button type="submit" disabled={question.trim() === '' || submitting}>
          {submitting
            ? label(locale, 'Đang tạo đề xuất…', 'Creating proposals…')
            : label(locale, 'Tạo đề xuất biểu đồ', 'Create chart proposals')}
        </button>
      </form>
      {stateMessage() !== undefined ? (
        <p className="dda-dashboard-agent-panel__state" role={nonAnswer ? 'alert' : 'status'}>
          {stateMessage()}
        </p>
      ) : null}
      {nonAnswer ? (
        <section
          className="dda-dashboard-agent-panel__manual"
          aria-label={label(locale, 'Phương án thủ công', 'Manual alternative')}
        >
          {onUseManualPlan !== undefined ? (
            <button type="button" onClick={onUseManualPlan}>
              {label(locale, 'Xem kế hoạch phân tích thủ công', 'View manual analysis plan')}
            </button>
          ) : null}
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
          locale={locale}
          options={activeOptions}
          onConfirm={onConfirmProposal}
          {...(confirmingProposal === undefined ? {} : { confirming: confirmingProposal })}
        />
      ) : null}
    </aside>
  );
}
