import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { DATABREEZE_MARK_SRC } from '../../app/brand-assets.ts';
import { cleaningAgentStore, type AgentMessageV1 } from './cleaning-agent-store.ts';
import { localDataStore } from './local-data-store.ts';

export interface DataAgentDockProps {
  readonly datasetId: string;
  readonly datasetLabel: string;
  readonly locale: 'en' | 'vi-VN';
  readonly onApprove: () => void;
  readonly onClose: () => void;
}

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        title: 'Trợ lý Dữ liệu',
        subtitle: 'Chat để chuẩn hóa — mọi thay đổi đều là đề xuất có kiểm chứng',
        placeholder: 'Ví dụ: Đổi cột Số lượng sang số nguyên…',
        send: 'Gửi',
        apply: 'Áp dụng',
        skip: 'Bỏ qua',
        applied: 'Đã áp dụng',
        skipped: 'Đã bỏ qua',
        lossyBadge: 'Cần xác nhận',
        safeBadge: 'An toàn',
        affected: 'ảnh hưởng',
        rows: 'dòng',
        columns: 'cột',
        approveCta: 'Duyệt & khóa phiên bản',
        readyHint: 'Bộ dữ liệu đã sẵn sàng — duyệt để khóa phiên bản bất biến.',
        close: 'Đóng',
      }
    : {
        title: 'Data Agent',
        subtitle: 'Chat to clean — every change is a verifiable proposal',
        placeholder: 'e.g. Change Quantity column to integer…',
        send: 'Send',
        apply: 'Apply',
        skip: 'Skip',
        applied: 'Applied',
        skipped: 'Skipped',
        lossyBadge: 'Needs confirm',
        safeBadge: 'Safe',
        affected: 'affects',
        rows: 'rows',
        columns: 'columns',
        approveCta: 'Approve & lock version',
        readyHint: 'The dataset is ready — approve to lock the immutable version.',
        close: 'Close',
      };
}

function ProposalCard({
  message,
  locale,
  text,
  onApply,
  onSkip,
}: {
  readonly message: AgentMessageV1;
  readonly locale: 'en' | 'vi-VN';
  readonly text: ReturnType<typeof copy>;
  readonly onApply: () => void;
  readonly onSkip: () => void;
}) {
  if (message.plan === undefined) return null;
  const vi = locale === 'vi-VN';
  return (
    <div
      className={`agent-proposal${message.status === 'pending' ? ' is-pending' : ` is-${message.status}`}`}
    >
      <div className="agent-proposal__head">
        <span className={`agent-proposal__badge${message.plan.anyLossy ? ' is-lossy' : ''}`}>
          {message.plan.anyLossy ? `⚠ ${text.lossyBadge}` : `✓ ${text.safeBadge}`}
        </span>
        {message.status !== 'pending' ? (
          <span className="agent-proposal__status">
            {message.status === 'applied' ? `✓ ${text.applied}` : `— ${text.skipped}`}
          </span>
        ) : null}
      </div>
      <ul className="agent-proposal__intents">
        {message.plan.intents.map((item, index) => (
          <li key={index}>
            <span className="agent-proposal__intent-text">
              {vi ? item.descriptionVi : item.descriptionEn}
            </span>
            <small className="agent-proposal__intent-meta">
              {text.affected} {item.affectedCount}{' '}
              {item.intent.kind === 'MERGE_ON_KEY' ? text.columns : text.rows}
              {item.invalidReason !== undefined ? ` · ⚠ ${item.invalidReason}` : ''}
            </small>
            {item.exampleBefore !== undefined && item.exampleAfter !== undefined ? (
              <small className="agent-proposal__example">
                <code>{item.exampleBefore}</code> → <code>{item.exampleAfter}</code>
              </small>
            ) : null}
          </li>
        ))}
      </ul>
      {message.status === 'pending' ? (
        <div className="agent-proposal__actions">
          <button type="button" className="db-button db-button--primary" onClick={onApply}>
            ✓ {text.apply}
          </button>
          <button type="button" className="db-button db-button--secondary" onClick={onSkip}>
            {text.skip}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function DataAgentDock({
  datasetId,
  datasetLabel,
  locale,
  onApprove,
  onClose,
}: DataAgentDockProps) {
  const text = copy(locale);
  const [draft, setDraft] = useState('');
  const thread = useSyncExternalStore(
    cleaningAgentStore.subscribe,
    () => cleaningAgentStore.getThread(datasetId),
    () => cleaningAgentStore.getThread(datasetId),
  );
  const record = useSyncExternalStore(
    localDataStore.subscribe,
    () => localDataStore.getDatasetRecord(datasetId),
    () => localDataStore.getDatasetRecord(datasetId),
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void cleaningAgentStore
      .loadThread(datasetId)
      .then(() => cleaningAgentStore.greet(datasetId, locale));
  }, [datasetId, locale]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [thread.messages.length]);

  const cleaningState = record?.cleaningState ?? 'RAW';

  function send(message: string) {
    const trimmed = message.trim();
    if (trimmed.length === 0) return;
    setDraft('');
    cleaningAgentStore.send(datasetId, trimmed, locale);
  }

  return (
    <aside className="agent-dock" aria-label={text.title}>
      <header className="agent-dock__header">
        <div className="agent-dock__identity">
          <span className="agent-dock__avatar" aria-hidden="true">
            <img alt="" src={DATABREEZE_MARK_SRC} />
          </span>
          <div>
            <strong>{text.title}</strong>
            <small>{text.subtitle}</small>
          </div>
        </div>
        <button
          type="button"
          className="agent-dock__close"
          onClick={onClose}
          aria-label={text.close}
        >
          ✕
        </button>
      </header>

      <div className="agent-dock__context" title={datasetLabel}>
        📄 {datasetLabel}
      </div>

      <div className="agent-dock__messages" ref={scrollRef}>
        {thread.messages.map((message) => {
          if (message.role === 'user') {
            return (
              <div className="agent-dock__bubble agent-dock__bubble--user" key={message.messageId}>
                {message.text}
              </div>
            );
          }
          if (message.role === 'proposal') {
            return (
              <ProposalCard
                key={message.messageId}
                message={message}
                locale={locale}
                text={text}
                onApply={() =>
                  cleaningAgentStore.applyProposal(datasetId, message.proposalId!, locale)
                }
                onSkip={() =>
                  cleaningAgentStore.skipProposal(datasetId, message.proposalId!, locale)
                }
              />
            );
          }
          if (message.role === 'applied') {
            return (
              <div className="agent-dock__chip agent-dock__chip--applied" key={message.messageId}>
                ✓ {message.text}
              </div>
            );
          }
          if (message.role === 'system') {
            return (
              <div className="agent-dock__note" key={message.messageId}>
                {message.text}
              </div>
            );
          }
          return (
            <div className="agent-dock__bubble agent-dock__bubble--agent" key={message.messageId}>
              {message.text}
              {message.suggestions !== undefined && message.suggestions.length > 0 ? (
                <div className="agent-dock__suggestions">
                  {message.suggestions.map((suggestion) => (
                    <button type="button" key={suggestion} onClick={() => send(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {cleaningState === 'REVIEW' ? (
        <div className="agent-dock__ready" role="status">
          <p>{text.readyHint}</p>
          <button type="button" className="db-button db-button--primary" onClick={onApprove}>
            🔒 {text.approveCta}
          </button>
        </div>
      ) : null}

      <footer className="agent-dock__composer">
        <form
          className="agent-dock__input-row"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <input
            className="agent-dock__input"
            placeholder={text.placeholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            className="agent-dock__send"
            disabled={draft.trim().length === 0}
            aria-label={text.send}
          >
            ➤
          </button>
        </form>
      </footer>
    </aside>
  );
}
