import type {
  StarterDashboardMatchResultV1,
  StarterDashboardProfileV1,
  StarterDashboardTemplateV1,
} from './starter-dashboard.types.js';

const ALLOWED_WIDGETS = new Set(['KPI', 'TABLE', 'BAR', 'LINE', 'AREA', 'DONUT', 'TEXT_EVIDENCE']);

function template(
  templateId: string,
  requiredRoles: readonly string[],
  widgets: StarterDashboardTemplateV1['widgets'],
): StarterDashboardTemplateV1 {
  for (const widget of widgets) {
    if (!ALLOWED_WIDGETS.has(widget.type)) {
      throw new Error(`UNSUPPORTED_WIDGET:${widget.type}`);
    }
  }
  return Object.freeze({
    templateId,
    version: 1,
    requiredRoles: Object.freeze([...requiredRoles]),
    widgets: Object.freeze(widgets.map((widget) => Object.freeze({ ...widget }))),
    aiUsed: false as const,
  });
}

const TEMPLATES: Readonly<Record<StarterDashboardProfileV1, StarterDashboardTemplateV1>> =
  Object.freeze({
    SALES_TIME_SERIES: template(
      'starter.sales.timeseries.v1',
      ['measure', 'time', 'category'],
      [
        { widgetId: 'kpi-revenue', type: 'KPI', title: { vi: 'Doanh thu', en: 'Revenue' } },
        { widgetId: 'line-trend', type: 'LINE', title: { vi: 'Xu hướng', en: 'Trend' } },
        { widgetId: 'table-detail', type: 'TABLE', title: { vi: 'Chi tiết', en: 'Detail' } },
      ],
    ),
    EXPENSE_RECEIPT: template(
      'starter.expense.receipt.v1',
      ['measure', 'time', 'category'],
      [
        { widgetId: 'kpi-spend', type: 'KPI', title: { vi: 'Chi tiêu', en: 'Spend' } },
        {
          widgetId: 'donut-merchant',
          type: 'DONUT',
          title: { vi: 'Theo nơi bán', en: 'By merchant' },
        },
        { widgetId: 'table-receipts', type: 'TABLE', title: { vi: 'Hóa đơn', en: 'Receipts' } },
      ],
    ),
    INVENTORY: template(
      'starter.inventory.v1',
      ['measure', 'category', 'time'],
      [
        { widgetId: 'kpi-qty', type: 'KPI', title: { vi: 'Tồn kho', en: 'On hand' } },
        { widgetId: 'bar-sku', type: 'BAR', title: { vi: 'Theo SKU', en: 'By SKU' } },
        {
          widgetId: 'table-stock',
          type: 'TABLE',
          title: { vi: 'Chi tiết tồn', en: 'Stock detail' },
        },
      ],
    ),
    GENERIC_TABLE: template(
      'starter.generic.table.v1',
      ['measure', 'category'],
      [
        { widgetId: 'kpi-value', type: 'KPI', title: { vi: 'Giá trị', en: 'Value' } },
        { widgetId: 'table-rows', type: 'TABLE', title: { vi: 'Bảng', en: 'Table' } },
      ],
    ),
  });

/** DDA-054: deterministic AI-free starter template matching. */
export class StarterDashboardTemplateRegistry {
  public isAiAuthoritative(): boolean {
    return false;
  }

  public match(input: {
    readonly profile: StarterDashboardProfileV1;
    readonly roles: Readonly<Record<string, string>>;
    readonly units: Readonly<Record<string, string>>;
    readonly grains: readonly string[];
  }): StarterDashboardMatchResultV1 {
    void input.units;
    void input.grains;
    const candidate = TEMPLATES[input.profile];
    if (!candidate) {
      return Object.freeze({ accepted: false, code: 'NO_SAFE_TEMPLATE' });
    }
    for (const role of candidate.requiredRoles) {
      if (!input.roles[role]) {
        return Object.freeze({ accepted: false, code: 'NO_SAFE_TEMPLATE' });
      }
    }
    return Object.freeze({ accepted: true, value: candidate });
  }
}
