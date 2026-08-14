import { useMemo, useState } from 'react';
import type { DesktopLocale } from '../../shared/desktop-contract-v1.ts';
import type {
  WorkbenchActivity,
  WorkbenchCatalogPage,
  WorkbenchSessionSnapshot,
  WorkbenchSyncStatus,
} from '../../shared/workbench-contract-v1.ts';
import { ActivityRail } from './activity-rail.tsx';
import { DockedAgent } from './docked-agent.tsx';
import { SourceExplorer, type SourceExplorerOpenTarget } from './source-explorer.tsx';
import { SourceImportDialog } from './source-import-dialog.tsx';
import { WorkbenchTabs, type WorkbenchTab, type WorkbenchTabsChange } from './workbench-tabs.tsx';
import { WorkbenchStatusBar } from './workbench-status-bar.tsx';
import { WorkspaceOverview } from './workspace-overview.tsx';

export type AnalysisWorkbenchProperties = {
  readonly activity?: WorkbenchActivity;
  readonly locale: DesktopLocale;
  readonly offline: boolean;
  readonly highContrast?: boolean;
  readonly scalePercent?: number;
  readonly lastGoodLabel?: string;
  readonly session: WorkbenchSessionSnapshot;
  readonly status: WorkbenchSyncStatus;
  readonly catalog: WorkbenchCatalogPage;
  readonly onActivityChange?: (activity: WorkbenchActivity) => void;
};

const LABELS = {
  'vi-VN': {
    analysisMain: 'Khu vực phân tích',
    dashboardMain: 'Khu vực bảng điều khiển',
    dataMain: 'Khu vực dữ liệu',
    reviewsMain: 'Khu vực đánh giá',
    settingsMain: 'Khu vực cài đặt',
    empty: 'Chọn một nguồn để mở thẻ làm việc.',
  },
  en: {
    analysisMain: 'Analysis work area',
    dashboardMain: 'Dashboard work area',
    dataMain: 'Data work area',
    reviewsMain: 'Reviews work area',
    settingsMain: 'Settings work area',
    empty: 'Select a source to open a workbench tab.',
  },
} as const;

function mainLabel(locale: DesktopLocale, activity: WorkbenchActivity): string {
  const copy = LABELS[locale];
  switch (activity) {
    case 'analysis':
      return copy.analysisMain;
    case 'dashboard':
      return copy.dashboardMain;
    case 'data':
      return copy.dataMain;
    case 'reviews':
      return copy.reviewsMain;
    case 'settings':
      return copy.settingsMain;
  }
}

export function AnalysisWorkbench({
  activity: controlledActivity,
  locale,
  offline,
  highContrast = false,
  scalePercent = 100,
  lastGoodLabel,
  session,
  status,
  catalog,
  onActivityChange,
}: AnalysisWorkbenchProperties) {
  const [internalActivity, setInternalActivity] = useState<WorkbenchActivity>(
    controlledActivity ?? 'dashboard',
  );
  const activity = controlledActivity ?? internalActivity;
  const [collapsed, setCollapsed] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(true);
  const [tabs, setTabs] = useState<WorkbenchTab[]>([]);
  const [closedTabs, setClosedTabs] = useState<WorkbenchTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const showDock = activity === 'dashboard' || activity === 'data';
  const copy = LABELS[locale];

  const className = useMemo(() => {
    const classes = ['analysis-workbench'];
    if (highContrast) classes.push('analysis-workbench--high-contrast');
    return classes.join(' ');
  }, [highContrast]);

  function setActivity(next: WorkbenchActivity) {
    if (controlledActivity === undefined) setInternalActivity(next);
    onActivityChange?.(next);
  }

  function openItem(target: SourceExplorerOpenTarget) {
    const id = `tab-${target.kind}-${target.id}`;
    const title =
      target.kind === 'dataset'
        ? (catalog.datasets.find((item) => item.datasetId === target.id)?.displayName ?? target.id)
        : target.kind === 'folder'
          ? (catalog.folders.find((item) => item.bindingId === target.id)?.displayName ?? target.id)
          : target.kind === 'review'
            ? (catalog.reviewItems.find((item) => item.reviewId === target.id)?.label ?? target.id)
            : (catalog.recentAnalyses.find((item) => item.conversationId === target.id)?.title ??
              target.id);
    const kind =
      target.kind === 'dataset'
        ? 'dataset'
        : target.kind === 'analysis'
          ? 'analysis'
          : target.kind === 'review'
            ? 'receipt'
            : 'original';
    setTabs((current) => {
      if (current.some((tab) => tab.id === id)) return current;
      return [...current, { id, kind, title }];
    });
    setActiveTabId(id);
  }

  function handleTabsChange(change: WorkbenchTabsChange) {
    if (change.type === 'activate') {
      setActiveTabId(change.tabId);
      return;
    }
    if (change.type === 'close') {
      setTabs((current) => {
        const closing = current.find((tab) => tab.id === change.tabId);
        if (closing !== undefined) {
          setClosedTabs((closed) => [...closed, closing]);
        }
        const next = current.filter((tab) => tab.id !== change.tabId);
        if (activeTabId === change.tabId) {
          setActiveTabId(next.at(-1)?.id ?? null);
        }
        return next;
      });
      return;
    }
    setTabs((current) => [...current, ...closedTabs]);
    setClosedTabs([]);
  }

  function openOriginal(fileId: string) {
    const id = `tab-original-${fileId}`;
    setTabs((current) => {
      if (current.some((tab) => tab.id === id)) return current;
      return [...current, { id, kind: 'original', title: fileId }];
    });
    setActiveTabId(id);
  }

  return (
    <div
      className={className}
      data-account={session.accountLabel ?? ''}
      data-scale={String(scalePercent)}
      data-workspace={session.workspaceLabel ?? ''}
    >
      <ActivityRail
        activity={activity}
        collapsed={collapsed}
        locale={locale}
        onActivityChange={setActivity}
        onCollapsedChange={setCollapsed}
      />
      <SourceExplorer
        catalog={catalog}
        locale={locale}
        onImport={() => setImportOpen(true)}
        onOpenItem={openItem}
      />
      <div className="analysis-workbench__center">
        <WorkbenchTabs
          activeTabId={activeTabId}
          locale={locale}
          onChange={handleTabsChange}
          tabs={tabs}
        />
        <main aria-label={mainLabel(locale, activity)} className="analysis-workbench__main">
          {lastGoodLabel !== undefined ? (
            <p className="analysis-workbench__last-good">{lastGoodLabel}</p>
          ) : null}
          {tabs.length === 0 && (activity === 'dashboard' || activity === 'data') ? (
            <WorkspaceOverview
              catalog={catalog}
              locale={locale}
              onAskAgent={() => setAgentOpen(true)}
              onOpenDataset={(datasetId) => openItem({ kind: 'dataset', id: datasetId })}
              onOpenFile={openOriginal}
              onOpenReview={(reviewId) => openItem({ kind: 'review', id: reviewId })}
            />
          ) : null}
          {tabs.length === 0 && activity !== 'dashboard' && activity !== 'data' ? (
            <p>{copy.empty}</p>
          ) : null}
          {activeTabId !== null ? <p>{tabs.find((tab) => tab.id === activeTabId)?.title}</p> : null}
        </main>
        {showDock ? (
          <DockedAgent
            locale={locale}
            onOpenChange={setAgentOpen}
            onSubmit={() => undefined}
            open={agentOpen}
          />
        ) : null}
      </div>
      <WorkbenchStatusBar locale={locale} offline={offline} status={status} />
      <SourceImportDialog
        locale={locale}
        onClose={() => setImportOpen(false)}
        onImport={() => setImportOpen(false)}
        open={importOpen}
      />
    </div>
  );
}
