import { useMemo, useState } from 'react';

import type { AnalysisConversationV1 } from './analysis-model.ts';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        collapse: 'Thu gọn lịch sử hội thoại',
        context: 'Ngữ cảnh dữ liệu',
        empty: 'Chưa có hội thoại được cấp quyền trong không gian làm việc này.',
        expand: 'Mở rộng lịch sử hội thoại',
        heading: 'Lịch sử hội thoại',
        search: 'Tìm lịch sử hội thoại',
        searchPlaceholder: 'Tìm theo tiêu đề hội thoại',
      }
    : {
        collapse: 'Collapse conversation history',
        context: 'Dataset context',
        empty: 'No authorized conversations are available in this workspace.',
        expand: 'Expand conversation history',
        heading: 'Conversation history',
        search: 'Search conversation history',
        searchPlaceholder: 'Search conversation titles',
      };
}

function contextSummary(item: AnalysisConversationV1): string {
  return item.datasetContext
    .map((context) => `${context.datasetLabel} · ${context.datasetVersionLabel}`)
    .join(' · ');
}

export interface ConversationHistoryProps {
  readonly activeConversationId?: string;
  readonly collapsed?: boolean;
  readonly items: readonly AnalysisConversationV1[];
  readonly locale: 'en' | 'vi-VN';
  readonly onCollapsedChange?: (collapsed: boolean) => void;
  readonly onSelectConversation?: (conversationId: string) => void;
}

/** DDA-055/056: history contains only already authorized workspace metadata. */
export function ConversationHistory({
  activeConversationId,
  collapsed = false,
  items,
  locale,
  onCollapsedChange,
  onSelectConversation,
}: ConversationHistoryProps) {
  const [query, setQuery] = useState('');
  const text = copy(locale);
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const matchingItems = useMemo(
    () => items.filter((item) => item.title.toLocaleLowerCase(locale).includes(normalizedQuery)),
    [items, locale, normalizedQuery],
  );

  return (
    <aside
      aria-label={text.heading}
      className="analysis-conversation-history"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="analysis-conversation-history__header">
        <h2>{text.heading}</h2>
        <button
          aria-controls="analysis-conversation-history-items"
          aria-expanded={!collapsed}
          aria-label={collapsed ? text.expand : text.collapse}
          className="analysis-conversation-history__collapse"
          onClick={() => onCollapsedChange?.(!collapsed)}
          type="button"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <path d={collapsed ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} />
          </svg>
        </button>
      </div>
      {collapsed ? null : (
        <>
          <label
            className="analysis-conversation-history__search-label"
            htmlFor="analysis-history-search"
          >
            {text.search}
          </label>
          <input
            className="analysis-conversation-history__search"
            id="analysis-history-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text.searchPlaceholder}
            type="search"
            value={query}
          />
          {matchingItems.length === 0 ? (
            <p className="analysis-conversation-history__empty" role="status">
              {text.empty}
            </p>
          ) : (
            <ul
              aria-label={
                locale === 'vi-VN' ? 'Mục lịch sử hội thoại' : 'Conversation history items'
              }
              className="analysis-conversation-history__items"
              id="analysis-conversation-history-items"
            >
              {matchingItems.map((item) => {
                const active = item.conversationId === activeConversationId;
                return (
                  <li key={item.conversationId}>
                    <button
                      aria-current={active ? 'page' : undefined}
                      className={`analysis-conversation-history__item${active ? ' is-active' : ''}`}
                      onClick={() => onSelectConversation?.(item.conversationId)}
                      type="button"
                    >
                      <span className="analysis-conversation-history__item-title">
                        {item.title}
                      </span>
                      {item.datasetContext.length > 0 ? (
                        <span className="analysis-conversation-history__item-context">
                          {contextSummary(item)}
                        </span>
                      ) : null}
                      {item.updatedLabel === undefined ? null : (
                        <span className="analysis-conversation-history__item-updated">
                          {item.updatedLabel}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
