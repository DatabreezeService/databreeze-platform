import type { DashboardDraftFixtureV1 } from './dashboard-api.ts';
import type { LocalAnalysisChartProposal } from '../analysis/local-analysis-engine.ts';

export type DashboardWidgetV1 = DashboardDraftFixtureV1['widgets'][number];

const PINNED_STORAGE_KEY = 'databreeze:pinned_widgets:v1';

export class DashboardPinnedStore {
  private customWidgets: DashboardWidgetV1[] = [];
  private listeners: Set<() => void> = new Set();

  public constructor() {
    this.load();
  }

  private load(): void {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(PINNED_STORAGE_KEY) : null;
      if (stored) {
        this.customWidgets = JSON.parse(stored);
      }
    } catch {
      this.customWidgets = [];
    }
  }

  private persist(): void {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(this.customWidgets));
      }
    } catch {
      // safe fallback
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public getCustomWidgets(): readonly DashboardWidgetV1[] {
    return this.customWidgets;
  }

  public addWidget(widget: DashboardWidgetV1): void {
    this.customWidgets = [...this.customWidgets, widget];
    this.persist();
  }

  public addFromAnalysisProposal(proposal: LocalAnalysisChartProposal, pageId = 'overview'): DashboardWidgetV1 {
    const widget: DashboardWidgetV1 = {
      widgetId: crypto.randomUUID(),
      pageId,
      type: proposal.type,
      title: {
        vi: proposal.title,
        en: proposal.title,
      },
      values: proposal.type === 'KPI'
        ? [{ label: proposal.title, value: proposal.aggregateValue ?? '0' }]
        : proposal.dataPoints.map((dp) => ({
            label: dp.label,
            value: dp.formatted,
          })),
    };

    this.addWidget(widget);
    return widget;
  }

  public removeWidget(widgetId: string): void {
    this.customWidgets = this.customWidgets.filter((w) => w.widgetId !== widgetId);
    this.persist();
  }

  public clear(): void {
    this.customWidgets = [];
    this.persist();
  }
}

export const dashboardPinnedStore = new DashboardPinnedStore();
