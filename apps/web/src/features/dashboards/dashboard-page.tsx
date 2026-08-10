import { useLocale } from '../../app/locale-context.tsx';
import { AnalystPanel } from './analyst-panel.tsx';
import { DashboardCanvas } from './dashboard-canvas.tsx';
import { DashboardViewer } from './dashboard-viewer.tsx';
import { ExportDialog } from './export-dialog.tsx';
import { PublishDialog } from './publish-dialog.tsx';
import { SnapshotComparison } from './snapshot-comparison.tsx';
import { TemplateDialog } from './template-dialog.tsx';
import type { DashboardDraftFixtureV1 } from './dashboard-api.ts';
import { useState } from 'react';

const FIXTURE_DRAFT: DashboardDraftFixtureV1 = Object.freeze({
  dashboardId: '00000000-0000-4000-8000-00000000001b',
  versionId: '00000000-0000-4000-8000-000000000011',
  pages: Object.freeze([
    Object.freeze({
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Doanh so', en: 'Sales' }),
    }),
  ]),
  widgets: Object.freeze([
    Object.freeze({
      widgetId: '00000000-0000-4000-8000-00000000001d',
      type: 'KPI',
      pageId: '00000000-0000-4000-8000-00000000001c',
      title: Object.freeze({ vi: 'Tong doanh so', en: 'Total sales' }),
      values: Object.freeze([
        Object.freeze({ label: 'amount', value: '1,250,000 VND' }),
      ]),
    }),
  ]),
  filters: Object.freeze([
    Object.freeze({
      filterId: '00000000-0000-4000-8000-00000000001e',
      field: 'region',
      operator: 'IN',
      scope: 'DASHBOARD',
    }),
  ]),
  freshness: 'Freshness: FRESH · last refresh 2026-08-10T10:00:00.000Z',
  warning: 'Evidence and authorization limits remain visible at every breakpoint.',
});

const PLAN_PREVIEW = Object.freeze({
  datasets: Object.freeze(['00000000-0000-4000-8000-000000000018']),
  semanticVersionId: '00000000-0000-4000-8000-000000000019',
  metricVersionId: '00000000-0000-4000-8000-00000000001a',
  dimensions: Object.freeze(['region']),
  filters: Object.freeze([
    Object.freeze({ field: 'year', operator: 'EQ', value: '2026' }),
  ]),
  timeRange: Object.freeze({
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-12-31T23:59:59.000Z',
  }),
  timeGrain: 'MONTH',
  joins: Object.freeze([]),
  units: Object.freeze({ amount: 'VND' }),
  assumptions: Object.freeze(['Uses accepted sales dataset only']),
  output: Object.freeze({ form: 'TABLE', maxRows: 100 }),
  estimate: Object.freeze({ cpuMs: 100, memoryMb: 64 }),
});

/** DDA-020..026/047..049: dashboard authoring page composing analyst + canvas + GA tools. */
export function DashboardPage() {
  const locale = useLocale();
  const [publishOpen, setPublishOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  return (
    <section className="dda-dashboard-page">
      <h1>{locale === 'vi-VN' ? 'Bảng điều khiển' : 'Dashboards'}</h1>
      <div>
        <button type="button" onClick={() => setPublishOpen(true)}>
          {locale === 'vi-VN' ? 'Xuất bản' : 'Publish'}
        </button>
        <button type="button" onClick={() => setTemplateOpen(true)}>
          {locale === 'vi-VN' ? 'Mẫu' : 'Template'}
        </button>
        <button type="button" onClick={() => setExportOpen(true)}>
          {locale === 'vi-VN' ? 'Xuất' : 'Export'}
        </button>
      </div>
      <AnalystPanel locale={locale} preview={PLAN_PREVIEW} />
      <DashboardCanvas locale={locale} draft={FIXTURE_DRAFT} />
      <DashboardViewer
        locale={locale}
        permissionExpansionDenied
        rows={[{ region: 'North', amount: '1,250,000' }]}
      />
      <SnapshotComparison
        locale={locale}
        changes={{ amount: { absolute: 50, percentage: 50 } }}
        changedWidgets={['bar-1']}
        changedInputs={['dataset-b']}
      />
      <PublishDialog
        locale={locale}
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onPublish={() => setPublishOpen(false)}
      />
      <TemplateDialog
        locale={locale}
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSave={() => setTemplateOpen(false)}
      />
      <ExportDialog
        locale={locale}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={() => setExportOpen(false)}
      />
    </section>
  );
}
