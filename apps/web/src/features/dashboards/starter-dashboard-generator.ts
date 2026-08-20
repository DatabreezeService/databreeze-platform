import type { DatasetCardV1 } from '../data/data-model.ts';
import { localDataStore } from '../data/local-data-store.ts';
import { dashboardPinnedStore, type DashboardWidgetV1 } from './dashboard-pinned-store.ts';

export interface GeneratedStarterDashboard {
  readonly dashboardId: string;
  readonly datasetId: string;
  readonly title: string;
  readonly widgets: readonly DashboardWidgetV1[];
}

export function generateStarterDashboard(
  dataset: DatasetCardV1,
  locale: 'en' | 'vi-VN',
): GeneratedStarterDashboard {
  const tabular = localDataStore.getTabularData(dataset.datasetId);
  const rows = tabular?.rows ?? [];
  const columns = tabular?.columns ?? [];

  const numericCols = columns.filter((c) => c.type === 'INTEGER' || c.type === 'DECIMAL');
  const textCols = columns.filter((c) => c.type === 'TEXT' || c.type === 'DATE');

  const primaryMeasure = numericCols[0]?.name;
  const secondaryMeasure = numericCols[1]?.name;
  const primaryDim = textCols[0]?.name;

  const dashboardId = `starter-${dataset.datasetId}`;
  const widgets: DashboardWidgetV1[] = [];

  // 1. KPI Widget: Total Primary Measure or Total Rows
  if (primaryMeasure && rows.length > 0) {
    let sum = 0;
    for (const r of rows) {
      const val = r[primaryMeasure];
      if (typeof val === 'number') sum += val;
    }
    const formattedSum =
      sum >= 1_000_000
        ? (sum / 1_000_000).toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US', {
            maximumFractionDigits: 1,
          }) + (locale === 'vi-VN' ? ' triệu' : 'M')
        : sum.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US');

    widgets.push({
      widgetId: `${dashboardId}-kpi-sum`,
      pageId: 'overview',
      type: 'KPI',
      title: {
        vi: `Tổng ${primaryMeasure}`,
        en: `Total ${primaryMeasure}`,
      },
      values: [
        {
          label: `Tổng ${primaryMeasure}`,
          value: locale === 'vi-VN' ? `₫${formattedSum}` : formattedSum,
        },
      ],
    });
  }

  // 2. KPI Widget: Total Records
  widgets.push({
    widgetId: `${dashboardId}-kpi-count`,
    pageId: 'overview',
    type: 'KPI',
    title: {
      vi: 'Tổng số bản ghi',
      en: 'Total records',
    },
    values: [
      {
        label: 'Bản ghi hợp lệ',
        value: rows.length.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US'),
      },
    ],
  });

  // 3. KPI Widget: Average or Secondary Measure
  if (primaryMeasure && rows.length > 0) {
    let sum = 0;
    for (const r of rows) {
      const val = r[primaryMeasure];
      if (typeof val === 'number') sum += val;
    }
    const avg = sum / rows.length;
    const formattedAvg = avg.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US', {
      maximumFractionDigits: 0,
    });

    widgets.push({
      widgetId: `${dashboardId}-kpi-avg`,
      pageId: 'overview',
      type: 'KPI',
      title: {
        vi: `Trung bình ${primaryMeasure}`,
        en: `Average ${primaryMeasure}`,
      },
      values: [
        {
          label: `Trung bình / dòng`,
          value: locale === 'vi-VN' ? `₫${formattedAvg}` : formattedAvg,
        },
      ],
    });
  }

  // 4. Bar Chart: Breakdown by primary dimension
  if (primaryDim && primaryMeasure && rows.length > 0) {
    const aggMap = new Map<string, number>();
    for (const r of rows) {
      const dimVal = String(r[primaryDim] ?? (locale === 'vi-VN' ? 'Khác' : 'Other'));
      const numVal = typeof r[primaryMeasure] === 'number' ? (r[primaryMeasure] as number) : 0;
      aggMap.set(dimVal, (aggMap.get(dimVal) ?? 0) + numVal);
    }
    const sorted = Array.from(aggMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const barValues = sorted.map(([lbl, val]) => ({
      label: lbl,
      value:
        val >= 1_000_000
          ? (val / 1_000_000).toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US', {
              maximumFractionDigits: 1,
            }) + (locale === 'vi-VN' ? ' tr' : 'M')
          : val.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US'),
    }));

    widgets.push({
      widgetId: `${dashboardId}-bar-categories`,
      pageId: 'overview',
      type: 'BAR',
      title: {
        vi: `${primaryMeasure} theo ${primaryDim}`,
        en: `${primaryMeasure} by ${primaryDim}`,
      },
      values: barValues,
    });
  }

  // 5. Donut Chart: Mix of Secondary or Primary
  if (primaryDim && rows.length > 0) {
    const countMap = new Map<string, number>();
    for (const r of rows) {
      const dimVal = String(r[primaryDim] ?? (locale === 'vi-VN' ? 'Khác' : 'Other'));
      countMap.set(dimVal, (countMap.get(dimVal) ?? 0) + 1);
    }
    const sortedCounts = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const total = rows.length;
    const donutValues = sortedCounts.map(([lbl, cnt]) => ({
      label: lbl,
      value: `${Math.round((cnt / total) * 100)}%`,
    }));

    widgets.push({
      widgetId: `${dashboardId}-donut-mix`,
      pageId: 'overview',
      type: 'DONUT',
      title: {
        vi: `Cơ cấu phân bổ theo ${primaryDim}`,
        en: `Distribution by ${primaryDim}`,
      },
      values: donutValues,
    });
  }

  // Register these widgets into dashboard pinned store
  for (const w of widgets) {
    dashboardPinnedStore.addWidget(w);
  }

  return {
    dashboardId,
    datasetId: dataset.datasetId,
    title: `${dataset.label} (Starter Dashboard)`,
    widgets,
  };
}
