import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import wordmarkUrl from '@databreeze/design-tokens/brand/generated/web/navigation-wordmark-blue-204x50.png';
import { appMessage } from '../../app/messages.ts';

export type AnalysisHistoryAvailability = 'available' | 'removed' | 'unavailable';

export interface AnalysisHistoryItem {
  readonly availability?: AnalysisHistoryAvailability;
  readonly id: string;
  readonly kind: 'analysis' | 'dashboard';
  readonly title?: string;
  readonly updatedLabel?: string;
}

export interface AnalysisHistoryPanelProperties {
  readonly activeSubjectId?: string;
  readonly collapsed: boolean;
  readonly items: readonly AnalysisHistoryItem[];
  readonly loadState?: 'error' | 'ready';
  readonly locale: 'en' | 'vi-VN';
  readonly mobileOpen?: boolean;
  readonly onActivate: (subjectId: string) => void;
  readonly onCollapsedChange: (collapsed: boolean) => void;
  readonly onCreate: () => void;
  readonly onMobileOpenChange?: (open: boolean) => void;
  readonly triggerRef?: RefObject<HTMLButtonElement | null>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function itemAvailability(item: AnalysisHistoryItem): AnalysisHistoryAvailability {
  return item.availability ?? 'available';
}

function unavailableLabel(
  locale: 'en' | 'vi-VN',
  availability: AnalysisHistoryAvailability,
): string {
  return appMessage(
    locale,
    availability === 'removed' ? 'history.item.removed' : 'history.item.unavailable',
  );
}

/** DDA-026/WEB-002: render only already authorized subject metadata, never source content. */
export function AnalysisHistoryPanel({
  activeSubjectId,
  collapsed,
  items,
  loadState = 'ready',
  locale,
  mobileOpen = false,
  onActivate,
  onCollapsedChange,
  onCreate,
  onMobileOpenChange,
  triggerRef,
}: AnalysisHistoryPanelProperties) {
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const wasMobileOpen = useRef(false);
  const isMobile = onMobileOpenChange !== undefined;
  const hidden = isMobile ? !mobileOpen : collapsed;
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const matchingItems = useMemo(
    () =>
      items.filter((item) => {
        if (itemAvailability(item) !== 'available') return normalizedQuery === '';
        return (item.title ?? '').toLocaleLowerCase(locale).includes(normalizedQuery);
      }),
    [items, locale, normalizedQuery],
  );

  useEffect(() => {
    if (!isMobile) {
      wasMobileOpen.current = false;
      return undefined;
    }

    if (mobileOpen) {
      wasMobileOpen.current = true;
      const focusPanel = globalThis.setTimeout(() => {
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
      }, 0);
      return () => globalThis.clearTimeout(focusPanel);
    }

    if (wasMobileOpen.current) {
      triggerRef?.current?.focus();
      wasMobileOpen.current = false;
    }
    return undefined;
  }, [isMobile, mobileOpen, triggerRef]);

  function closeMobilePanel() {
    onMobileOpenChange?.(false);
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!isMobile) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMobilePanel();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && globalThis.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleCreate() {
    onCreate();
    if (isMobile) closeMobilePanel();
  }

  function handleActivate(subjectId: string) {
    onActivate(subjectId);
    if (isMobile) closeMobilePanel();
  }

  return (
    <aside
      aria-label={appMessage(locale, 'history.heading')}
      aria-modal={isMobile ? true : undefined}
      className={`analysis-history-panel${isMobile ? ' analysis-history-panel--mobile' : ''}`}
      hidden={hidden}
      id="analysis-history-panel"
      onKeyDown={handlePanelKeyDown}
      ref={panelRef}
      role={isMobile ? 'dialog' : 'complementary'}
    >
      <div className="analysis-history-panel__brand">
        <img alt="DataBreeze" height="50" src={wordmarkUrl} width="204" />
      </div>
      <div className="analysis-history-panel__header">
        <div>
          <p className="analysis-history-panel__eyebrow">{appMessage(locale, 'history.scope')}</p>
          <h2>{appMessage(locale, 'history.heading')}</h2>
        </div>
        {isMobile ? (
          <button
            aria-label={appMessage(locale, 'history.close')}
            className="analysis-history-panel__close"
            onClick={closeMobilePanel}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="18"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
              width="18"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        ) : (
          <button
            aria-controls="analysis-history-panel"
            aria-expanded={!collapsed}
            aria-label={appMessage(locale, 'history.collapse')}
            className="analysis-history-panel__collapse"
            onClick={() => onCollapsedChange(true)}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="18"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
              width="18"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
      </div>
      <button className="analysis-history-panel__create" onClick={handleCreate} type="button">
        {appMessage(locale, 'history.create')}
      </button>
      <label className="analysis-history-panel__search-label" htmlFor="analysis-history-search">
        {appMessage(locale, 'history.search.label')}
      </label>
      <input
        className="analysis-history-panel__search"
        id="analysis-history-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder={appMessage(locale, 'history.search.placeholder')}
        type="search"
        value={query}
      />
      {loadState === 'error' ? (
        <p className="analysis-history-panel__state" role="status">
          {appMessage(locale, 'history.error')}
        </p>
      ) : matchingItems.length === 0 ? (
        <p className="analysis-history-panel__state" role="status">
          {appMessage(locale, 'history.empty')}
        </p>
      ) : (
        <ul className="analysis-history-panel__items">
          {matchingItems.map((item) => {
            const availability = itemAvailability(item);
            const available = availability === 'available';
            const label = available ? (item.title ?? '') : unavailableLabel(locale, availability);
            return (
              <li key={item.id}>
                <button
                  aria-current={available && activeSubjectId === item.id ? 'page' : undefined}
                  aria-label={label}
                  className={`analysis-history-panel__item${
                    available && activeSubjectId === item.id ? ' is-active' : ''
                  }`}
                  disabled={!available}
                  onClick={() => handleActivate(item.id)}
                  type="button"
                >
                  <span className="analysis-history-panel__item-kind">
                    {item.kind === 'dashboard'
                      ? locale === 'vi-VN'
                        ? 'Bảng điều khiển'
                        : 'Dashboard'
                      : locale === 'vi-VN'
                        ? 'Phân tích'
                        : 'Analysis'}
                  </span>
                  <span className="analysis-history-panel__item-title">{label}</span>
                  {available && item.updatedLabel !== undefined ? (
                    <span className="analysis-history-panel__item-updated">
                      {item.updatedLabel}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
