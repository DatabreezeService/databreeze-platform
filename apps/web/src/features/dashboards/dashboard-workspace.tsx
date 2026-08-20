import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { appMessage } from '../../app/messages.ts';
import { workspaceAgentStore } from '../agent/workspace-agent-store.ts';
import {
  fetchDashboardWorkspaceHistory,
  type DashboardWorkspaceHistoryV1,
} from './dashboard-authoring-api.ts';
import { dashboardApiBaseConfiguration, dashboardDemoMode } from './dashboard-api.ts';
import { AnalysisHistoryPanel, type AnalysisHistoryItem } from './analysis-history-panel.tsx';

const HISTORY_COLLAPSED_STORAGE_KEY = 'databreeze.dashboardHistoryCollapsed=v1';
const NARROW_WORKSPACE_QUERY = '(max-width: 1023px)';
const EMPTY_HISTORY: DashboardWorkspaceHistoryV1 = Object.freeze({
  schemaVersion: 3,
  items: Object.freeze([]),
});
const DEMO_HISTORY: DashboardWorkspaceHistoryV1 = Object.freeze({
  schemaVersion: 3,
  items: Object.freeze([
    Object.freeze({
      kind: 'DASHBOARD' as const,
      subjectId: '00000000-0000-4000-8000-00000000001b',
      title: Object.freeze({ vi: 'Tổng quan bán hàng', en: 'Sales overview' }),
      safeStatus: 'CURRENT' as const,
      updatedAt: '2026-08-12T10:00:00.000Z',
    }),
    Object.freeze({
      kind: 'ANALYSIS' as const,
      subjectId: '00000000-0000-4000-8000-000000000031',
      title: Object.freeze({ vi: 'Doanh thu theo khu vực', en: 'Revenue by region' }),
      safeStatus: 'CURRENT' as const,
      updatedAt: '2026-08-11T09:15:00.000Z',
    }),
  ]),
});

function toHistoryItems(
  history: DashboardWorkspaceHistoryV1,
  locale: 'en' | 'vi-VN',
): readonly AnalysisHistoryItem[] {
  const language = locale === 'vi-VN' ? 'vi' : 'en';
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  return history.items.map((item) => ({
    id: item.subjectId,
    kind: item.kind === 'DASHBOARD' ? 'dashboard' : 'analysis',
    title: item.title[language],
    updatedLabel: formatter.format(new Date(item.updatedAt)),
  }));
}

function readCollapsedPreference(): boolean {
  try {
    return globalThis.localStorage.getItem(HISTORY_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function useNarrowWorkspace(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia(NARROW_WORKSPACE_QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return undefined;
    const mediaQuery = globalThis.matchMedia(NARROW_WORKSPACE_QUERY);
    const update = (event: MediaQueryListEvent) => setNarrow(event.matches);
    setNarrow(mediaQuery.matches);
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return narrow;
}

export interface DashboardWorkspaceProperties {
  readonly activeSubjectId?: string;
  readonly children: ReactNode;
  readonly historyItems?: readonly AnalysisHistoryItem[];
  readonly historyLoadState?: 'error' | 'ready';
  readonly locale: 'en' | 'vi-VN';
}

export interface DashboardWorkspaceHistoryNavigationStateV1 {
  readonly historySubject: {
    readonly kind: 'ANALYSIS' | 'DASHBOARD';
    readonly subjectId: string;
    readonly title: string;
  };
}

/** DDA-026/033: composition for the governed dashboard stage and authorized local history. */
export function DashboardWorkspace({
  activeSubjectId: initialActiveSubjectId,
  children,
  historyItems: suppliedHistoryItems,
  historyLoadState: suppliedHistoryLoadState,
  locale,
}: DashboardWorkspaceProperties) {
  const configuration = dashboardApiBaseConfiguration();
  const location = useLocation();
  const navigate = useNavigate();
  const demoMode = dashboardDemoMode();
  const [remoteHistory, setRemoteHistory] = useState<DashboardWorkspaceHistoryV1>();
  const [historyFailed, setHistoryFailed] = useState(false);

  useEffect(() => {
    if (suppliedHistoryItems !== undefined || demoMode || configuration === undefined)
      return undefined;
    const controller = new AbortController();
    setHistoryFailed(false);
    void fetchDashboardWorkspaceHistory(
      { baseUrl: configuration.baseUrl, limit: 50 },
      controller.signal,
    ).then(
      (history) => setRemoteHistory(history),
      (error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setHistoryFailed(true);
      },
    );
    return () => controller.abort();
  }, [configuration?.baseUrl, demoMode, suppliedHistoryItems]);

  const historyItems =
    suppliedHistoryItems ??
    toHistoryItems(demoMode ? DEMO_HISTORY : (remoteHistory ?? EMPTY_HISTORY), locale);
  const historyLoadState = suppliedHistoryLoadState ?? (historyFailed ? 'error' : 'ready');
  const routeSubjectId = new URLSearchParams(location.search).get('dashboard') ?? undefined;
  const isNarrow = useNarrowWorkspace();
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSubjectId, setActiveSubjectId] = useState(initialActiveSubjectId);
  const [feedback, setFeedback] = useState<string | null>(null);
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const historyExpanded = isNarrow ? mobileOpen : !collapsed;

  useEffect(() => {
    setActiveSubjectId(initialActiveSubjectId ?? routeSubjectId);
  }, [initialActiveSubjectId, routeSubjectId]);

  function updateCollapsedPreference(nextCollapsed: boolean) {
    setCollapsed(nextCollapsed);
    try {
      globalThis.localStorage.setItem(HISTORY_COLLAPSED_STORAGE_KEY, String(nextCollapsed));
    } catch {
      // The shell remains usable when browser storage is unavailable.
    }
  }

  return (
    <section
      className="dashboard-workspace"
      data-history-collapsed={!isNarrow && collapsed ? 'true' : 'false'}
    >
      <AnalysisHistoryPanel
        collapsed={collapsed}
        items={historyItems}
        loadState={historyLoadState}
        locale={locale}
        mobileOpen={mobileOpen}
        onActivate={(subjectId) => {
          const item = historyItems.find((candidate) => candidate.id === subjectId);
          if (item === undefined) return;
          setActiveSubjectId(subjectId);
          setFeedback(appMessage(locale, 'history.opened'));
          const historySubject = {
            kind: item.kind === 'analysis' ? ('ANALYSIS' as const) : ('DASHBOARD' as const),
            subjectId,
            title: item.title ?? '',
          };
          const state: DashboardWorkspaceHistoryNavigationStateV1 = { historySubject };
          if (item.kind === 'analysis') {
            workspaceAgentStore.setActiveConversation({
              conversationId: subjectId,
              title: historySubject.title,
              datasetLabel:
                locale === 'vi-VN'
                  ? 'Đối tượng lịch sử được cấp quyền'
                  : 'Authorized history subject',
              datasetVersionLabel:
                locale === 'vi-VN'
                  ? 'Ngữ cảnh lịch sử được cấp quyền'
                  : 'Authorized history subject',
            });
            void navigate(`/${locale}/analysis?conversation=${encodeURIComponent(subjectId)}`, {
              state,
            });
            return;
          }
          void navigate(`/${locale}/dashboards?dashboard=${encodeURIComponent(subjectId)}`, {
            state,
          });
        }}
        onCollapsedChange={updateCollapsedPreference}
        onCreate={() => {
          // The history action must take the user to the real analysis creation
          // flow. A status-only callback made this button appear interactive
          // while doing nothing beyond changing an inaccessible announcement.
          void navigate(`/${locale}/analysis?new=1`);
        }}
        triggerRef={historyTriggerRef}
        {...(activeSubjectId === undefined ? {} : { activeSubjectId })}
        {...(isNarrow ? { onMobileOpenChange: setMobileOpen } : {})}
      />
      <div className="dashboard-workspace__stage">
        {isNarrow || collapsed ? (
          <div className="dashboard-workspace__tools">
            <button
              aria-controls="analysis-history-panel"
              aria-expanded={historyExpanded}
              className="dashboard-workspace__history-toggle"
              onClick={() => {
                if (isNarrow) {
                  setMobileOpen((open) => !open);
                  return;
                }
                updateCollapsedPreference(false);
              }}
              ref={historyTriggerRef}
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
                <path d="m9 18 6-6-6-6" />
              </svg>
              <span>
                {appMessage(locale, historyExpanded ? 'history.collapse' : 'history.expand')}
              </span>
            </button>
          </div>
        ) : null}
        {feedback === null ? null : (
          <p className="sr-only" role="status">
            {feedback}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
