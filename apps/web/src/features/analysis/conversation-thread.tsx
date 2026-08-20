import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import brandMarkUrl from '@databreeze/design-tokens/brand/generated/web/favicon-32.png';

import type { AnalysisConversationV1, AnalysisChartProposalV1 } from './analysis-model.ts';
import { dashboardPinnedStore } from '../dashboards/dashboard-pinned-store.ts';

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
          ['So sánh với kỳ trước', 'So sánh các chỉ số chính với kỳ trước'],
          ['Tìm điểm bất thường', 'Tìm điểm bất thường trong dữ liệu này'],
        ] as const,
        send: 'Gửi câu hỏi',
        unavailable: 'Chưa có lệnh gửi được ủy quyền cho hội thoại này.',
        addToDashboard: '➕ Thêm vào Bảng điều khiển',
        addedToDashboard: '✓ Đã ghim vào Bảng điều khiển',
        openDashboard: 'Xem trên Canvas →',
        chartPreview: 'Biểu đồ trực quan đề xuất',
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
          ['Compare with previous period', 'Compare key metrics with the previous period'],
          ['Find anomalies', 'Find anomalies in this data'],
        ] as const,
        send: 'Send question',
        unavailable: 'No authorized send command is available for this conversation.',
        addToDashboard: '➕ Add to Dashboard',
        addedToDashboard: '✓ Pinned to Dashboard',
        openDashboard: 'View on Canvas →',
        chartPreview: 'Suggested Chart Preview',
      };
}

function messageRoleLabel(locale: 'en' | 'vi-VN', role: 'USER' | 'AGENT' | 'SYSTEM'): string {
  if (locale === 'vi-VN') {
    return role === 'USER' ? 'Bạn' : role === 'AGENT' ? 'Trợ lý' : 'Hệ thống';
  }
  return role === 'USER' ? 'You' : role === 'AGENT' ? 'Agent' : 'System';
}

function ChartProposalCard({
  proposal,
  locale,
}: {
  readonly proposal: AnalysisChartProposalV1;
  readonly locale: 'en' | 'vi-VN';
}) {
  const text = copy(locale);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    dashboardPinnedStore.addFromAnalysisProposal(proposal);
    setAdded(true);
  }

  return (
    <div className="analysis-chart-proposal-card">
      <div className="analysis-chart-proposal-card__header">
        <div>
          <small className="analysis-chart-type-tag">{proposal.type}</small>
          <h4>{proposal.title}</h4>
        </div>
        <div className="analysis-chart-proposal-card__actions">
          {added ? (
            <div className="analysis-chart-added-group">
              <span className="analysis-chart-added-badge">{text.addedToDashboard}</span>
              <Link
                className="db-button db-button--secondary db-button--sm"
                to={`/${locale}/dashboards`}
              >
                {text.openDashboard}
              </Link>
            </div>
          ) : (
            <button
              className="db-button db-button--primary db-button--sm"
              onClick={handleAdd}
              type="button"
            >
              {text.addToDashboard}
            </button>
          )}
        </div>
      </div>

      <div className="analysis-chart-preview-body">
        {proposal.type === 'KPI' ? (
          <div className="analysis-kpi-preview">
            <span className="analysis-kpi-value">{proposal.aggregateValue ?? '0'}</span>
            <span className="analysis-kpi-label">{proposal.summary}</span>
          </div>
        ) : (
          <div className="analysis-bars-preview">
            {proposal.dataPoints.slice(0, 5).map((point) => {
              const maxVal = Math.max(...proposal.dataPoints.map((p) => p.value), 1);
              const pct = Math.max(8, Math.min(100, (point.value / maxVal) * 100));
              return (
                <div className="analysis-bar-row" key={point.label}>
                  <span className="analysis-bar-label">{point.label}</span>
                  <div className="analysis-bar-track">
                    <div className="analysis-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="analysis-bar-value">{point.formatted}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ConversationThreadProps {
  readonly conversation: AnalysisConversationV1;
  readonly locale: 'en' | 'vi-VN';
  readonly onSendMessage?: (message: string) => void | Promise<void>;
}

/** DDA-055: renders message records and interactive chart proposals */
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
      // The parent owns localized failure copy. Preserve draft.
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
              <div className="analysis-conversation-thread__message-content">
                <p style={{ whiteSpace: 'pre-line' }}>{message.text}</p>
                {message.chartProposal ? (
                  <ChartProposalCard locale={locale} proposal={message.chartProposal} />
                ) : null}
              </div>
              {message.createdLabel === undefined ? null : <time>{message.createdLabel}</time>}
            </li>
          ))}
        </ol>
      )}
      <form
        className="analysis-conversation-thread__composer"
        onSubmit={(event) => void submit(event)}
      >
        <div className="analysis-composer-followup-chips">
          {text.prompts.map(([lbl, prompt]) => (
            <button
              key={lbl}
              type="button"
              className="analysis-followup-chip"
              onClick={() => {
                setDraft(prompt);
                composerRef.current?.focus();
              }}
            >
              💬 {lbl}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor={`analysis-composer-${conversation.conversationId}`}>
          {text.composer}
        </label>
        <textarea
          disabled={!canSend || sending}
          id={`analysis-composer-${conversation.conversationId}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit(event as unknown as FormEvent<HTMLFormElement>);
            }
          }}
          placeholder={text.placeholder}
          ref={composerRef}
          rows={2}
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
