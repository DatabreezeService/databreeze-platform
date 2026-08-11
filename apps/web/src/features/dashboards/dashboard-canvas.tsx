import { useEffect, useMemo, useState } from 'react';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import { FilterBar } from './filter-bar.tsx';
import { WidgetEditor } from './widget-editor.tsx';
import { WidgetFrame } from './widget-frame.tsx';
import type { DashboardDraftFixtureV1 } from './dashboard-api.ts';

export interface DashboardCanvasProps {
  readonly locale: SupportedLocaleV1;
  readonly draft: DashboardDraftFixtureV1;
  readonly breakpoint?: 'desktop' | 'tablet' | 'mobile';
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-020..024: versioned accessible canvas with non-hiding responsive chrome. */
export function DashboardCanvas({ locale, draft, breakpoint = 'desktop' }: DashboardCanvasProps) {
  const [widgets, setWidgets] = useState(draft.widgets);
  const [editorOpen, setEditorOpen] = useState(false);
  const [removed, setRemoved] = useState<typeof draft.widgets>([]);
  const [selected, setSelected] = useState<string | undefined>(widgets[0]?.widgetId);

  useEffect(() => {
    setWidgets(draft.widgets);
    setRemoved([]);
    setSelected(draft.widgets[0]?.widgetId);
  }, [draft.dashboardId, draft.versionId, draft.widgets]);

  const ordered = useMemo(() => widgets, [widgets]);

  return (
    <section
      className={`dda-dashboard-canvas dda-breakpoint-${breakpoint}`}
      aria-label={label(locale, 'Bề mặt bảng điều khiển', 'Dashboard canvas')}
    >
      <header>
        <h2>{label(locale, 'Bố cục phản hồi', 'Responsive layout')}</h2>
        <p role="status">{draft.freshness}</p>
        <p role="alert">{draft.warning}</p>
        <button type="button" onClick={() => setEditorOpen(true)}>
          {label(locale, 'Thêm tiện ích', 'Add widget')}
        </button>
        <button
          type="button"
          disabled={removed.length === 0}
          onClick={() => {
            const [first, ...rest] = removed;
            if (!first) return;
            setWidgets((current) => [...current, first]);
            setRemoved(rest);
          }}
        >
          {label(locale, 'Khôi phục tiện ích', 'Restore widget')}
        </button>
      </header>
      <FilterBar
        locale={locale}
        filters={draft.filters}
        onChange={() => {
          /* filter values reauthorize server-side on apply */
        }}
      />
      <div className="dda-widget-grid" role="list">
        {ordered.map((widget) => (
          <div
            key={widget.widgetId}
            role="listitem"
            className={selected === widget.widgetId ? 'dda-widget-selected' : undefined}
            onFocus={() => setSelected(widget.widgetId)}
          >
            <WidgetFrame
              locale={locale}
              widgetId={widget.widgetId}
              type={widget.type}
              title={widget.title}
              values={widget.values}
              warning={draft.warning}
              freshness={draft.freshness}
              onConfigure={(id) => setSelected(id)}
              onRemove={(id) => {
                setWidgets((current) => {
                  const target = current.find((item) => item.widgetId === id);
                  if (target) setRemoved((prev) => [...prev, target]);
                  return current.filter((item) => item.widgetId !== id);
                });
              }}
            />
          </div>
        ))}
      </div>
      <WidgetEditor
        locale={locale}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onAdd={(type) => {
          const widgetId = crypto.randomUUID();
          setWidgets((current) => [
            ...current,
            {
              widgetId,
              type,
              pageId: draft.pages[0]?.pageId ?? 'page',
              title: { vi: type, en: type },
              values: [{ label: type, value: '—' }],
            },
          ]);
          setEditorOpen(false);
          setSelected(widgetId);
        }}
      />
    </section>
  );
}
