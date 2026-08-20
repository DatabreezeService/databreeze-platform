import type { DashboardDraftFixtureV1 } from './dashboard-api.ts';
import type { LocalAnalysisChartProposal } from '../analysis/local-analysis-engine.ts';

export type DashboardWidgetV1 = DashboardDraftFixtureV1['widgets'][number];

const PINNED_STORAGE_KEY = 'databreeze:pinned_widgets:v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDashboardWidget(value: unknown): value is DashboardWidgetV1 {
  if (!isRecord(value) || !isRecord(value['title']) || !Array.isArray(value['values'])) {
    return false;
  }
  const type = value['type'];
  return (
    typeof value['widgetId'] === 'string' &&
    typeof value['pageId'] === 'string' &&
    (type === 'KPI' || type === 'BAR' || type === 'LINE' || type === 'DONUT' || type === 'TABLE') &&
    typeof value['title']['vi'] === 'string' &&
    typeof value['title']['en'] === 'string' &&
    value['values'].every(
      (item: unknown) =>
        isRecord(item) && typeof item['label'] === 'string' && typeof item['value'] === 'string',
    )
  );
}

export class DashboardPinnedStore {
  private customWidgets: DashboardWidgetV1[] = [];
  private listeners: Set<() => void> = new Set();

  public constructor() {
    this.load();
  }

  private load(): void {
    try {
      const stored =
        typeof window !== 'undefined' ? window.localStorage.getItem(PINNED_STORAGE_KEY) : null;
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        this.customWidgets = Array.isArray(parsed) ? parsed.filter(isDashboardWidget) : [];
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

  public addFromAnalysisProposal(
    proposal: LocalAnalysisChartProposal,
    pageId = 'overview',
  ): DashboardWidgetV1 {
    const widget: DashboardWidgetV1 = {
      widgetId: crypto.randomUUID(),
      pageId,
      type: proposal.type,
      title: {
        vi: proposal.title,
        en: proposal.title,
      },
      values:
        proposal.type === 'KPI'
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
