import { useEffect, useMemo, useRef, useState } from 'react';

import { SearchIcon } from '../../components/icons.tsx';

import type { AnalysisConversationV1 } from './analysis-model.ts';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        context: 'Ngữ cảnh dữ liệu',
        closeSearch: 'Đóng tìm kiếm lịch sử hội thoại',
        empty: 'Chưa có hội thoại được cấp quyền trong không gian làm việc này.',
        heading: 'Lịch sử hội thoại',
        create: 'Tạo hội thoại mới',
        search: 'Tìm lịch sử hội thoại',
        searchPlaceholder: 'Tìm theo tiêu đề hội thoại',
      }
    : {
        context: 'Dataset context',
        closeSearch: 'Close conversation history search',
        empty: 'No authorized conversations are available in this workspace.',
        heading: 'Conversation history',
        create: 'Create new conversation',
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
  readonly onCreate?: () => void;
  readonly onSelectConversation?: (conversationId: string) => void;
}

/** DDA-055/056: history contains only already authorized workspace metadata. */
export function ConversationHistory({
  activeConversationId,
  collapsed = false,
  items,
  locale,
  onCreate,
  onSelectConversation,
}: ConversationHistoryProps) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const text = copy(locale);
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const matchingItems = useMemo(
    () => items.filter((item) => item.title.toLocaleLowerCase(locale).includes(normalizedQuery)),
    [items, locale, normalizedQuery],
  );

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  function toggleSearch(): void {
    setSearchOpen((current) => {
      if (current) setQuery('');
      return !current;
    });
  }

  return (
    <aside
      aria-label={text.heading}
      className="analysis-conversation-history"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="analysis-conversation-history__header">
        <div className="analysis-conversation-history__header-main">
          <h2>{text.heading}</h2>
        </div>
        <div className="analysis-conversation-history__header-actions">
          {collapsed ? null : (
            <button
              aria-controls="analysis-history-search-panel"
              aria-expanded={searchOpen}
              aria-label={searchOpen ? text.closeSearch : text.search}
              className="analysis-conversation-history__search-toggle"
              onClick={toggleSearch}
              title={searchOpen ? text.closeSearch : text.search}
              type="button"
            >
              <SearchIcon height={17} width={17} />
            </button>
          )}
          {collapsed || onCreate === undefined ? null : (
            <button
              aria-label={text.create}
              className="analysis-conversation-history__create"
              onClick={() => onCreate()}
              title={text.create}
              type="button"
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {collapsed ? null : (
        <>
          {searchOpen ? (
            <div
              className="analysis-conversation-history__search-panel"
              id="analysis-history-search-panel"
            >
              <label
                className="analysis-conversation-history__search-label"
                htmlFor="analysis-history-search"
              >
                {text.search}
              </label>
              <input
                ref={searchInputRef}
                aria-label={text.search}
                className="analysis-conversation-history__search"
                id="analysis-history-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={text.searchPlaceholder}
                type="search"
                value={query}
              />
            </div>
          ) : null}
          {matchingItems.length === 0 ? (
            <p className="analysis-conversation-history__empty">{text.empty}</p>
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
