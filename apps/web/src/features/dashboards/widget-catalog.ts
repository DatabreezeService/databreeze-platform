export type DashboardWidgetTypeV1 =
  | 'KPI'
  | 'TABLE'
  | 'BAR'
  | 'LINE'
  | 'AREA'
  | 'PIE'
  | 'DONUT'
  | 'TEXT_NOTE'
  | 'EVIDENCE_NOTE';

export type DashboardWidgetSpanV1 = 3 | 4 | 6 | 8 | 12;

export interface WidgetCatalogEntryV1 {
  readonly type: DashboardWidgetTypeV1;
  readonly compatibleFieldTypes: readonly string[];
  readonly grains: readonly string[];
  readonly unitsRequired: boolean;
  readonly maxRows: number;
  readonly supportedSpans: readonly DashboardWidgetSpanV1[];
  readonly minimumHeight: number;
  readonly interactions: readonly ('filter' | 'drill' | 'sort')[];
  readonly accessibilityDescription: { readonly vi: string; readonly en: string };
  readonly evidenceRequired: boolean;
  readonly fallbackTable: true;
}

/** DDA-021: V1 allowlisted widgets with compatibility metadata. */
export const WIDGET_CATALOG_V1: readonly WidgetCatalogEntryV1[] = Object.freeze([
  Object.freeze({
    type: 'KPI' as const,
    compatibleFieldTypes: Object.freeze(['number', 'currency']),
    grains: Object.freeze(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']),
    unitsRequired: true,
    maxRows: 1,
    supportedSpans: Object.freeze([3, 4, 6] as const),
    minimumHeight: 3,
    interactions: Object.freeze(['filter'] as const),
    accessibilityDescription: Object.freeze({
      vi: 'Chỉ số KPI với bảng dự phòng',
      en: 'KPI metric with fallback table',
    }),
    evidenceRequired: true,
    fallbackTable: true,
  }),
  Object.freeze({
    type: 'TABLE' as const,
    compatibleFieldTypes: Object.freeze(['string', 'number', 'currency', 'date']),
    grains: Object.freeze(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']),
    unitsRequired: false,
    maxRows: 500,
    supportedSpans: Object.freeze([6, 8, 12] as const),
    minimumHeight: 6,
    interactions: Object.freeze(['filter', 'sort'] as const),
    accessibilityDescription: Object.freeze({ vi: 'Bảng dữ liệu', en: 'Data table' }),
    evidenceRequired: true,
    fallbackTable: true,
  }),
  Object.freeze({
    type: 'BAR' as const,
    compatibleFieldTypes: Object.freeze(['number', 'currency', 'string']),
    grains: Object.freeze(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']),
    unitsRequired: true,
    maxRows: 100,
    supportedSpans: Object.freeze([6, 8, 12] as const),
    minimumHeight: 5,
    interactions: Object.freeze(['filter', 'drill'] as const),
    accessibilityDescription: Object.freeze({
      vi: 'Biểu đồ cột với bảng dự phòng',
      en: 'Bar chart with fallback table',
    }),
    evidenceRequired: true,
    fallbackTable: true,
  }),
  Object.freeze({
    type: 'LINE' as const,
    compatibleFieldTypes: Object.freeze(['number', 'currency', 'date']),
    grains: Object.freeze(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']),
    unitsRequired: true,
    maxRows: 200,
    supportedSpans: Object.freeze([6, 8, 12] as const),
    minimumHeight: 5,
    interactions: Object.freeze(['filter', 'drill'] as const),
    accessibilityDescription: Object.freeze({
      vi: 'Biểu đồ đường với bảng dự phòng',
      en: 'Line chart with fallback table',
    }),
    evidenceRequired: true,
    fallbackTable: true,
  }),
  Object.freeze({
    type: 'AREA' as const,
    compatibleFieldTypes: Object.freeze(['number', 'currency', 'date']),
    grains: Object.freeze(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']),
    unitsRequired: true,
    maxRows: 200,
    supportedSpans: Object.freeze([6, 8, 12] as const),
    minimumHeight: 5,
    interactions: Object.freeze(['filter'] as const),
    accessibilityDescription: Object.freeze({
      vi: 'Biểu đồ vùng với bảng dự phòng',
      en: 'Area chart with fallback table',
    }),
    evidenceRequired: true,
    fallbackTable: true,
  }),
  Object.freeze({
    type: 'PIE' as const,
    compatibleFieldTypes: Object.freeze(['number', 'currency', 'string']),
    grains: Object.freeze(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']),
    unitsRequired: true,
    maxRows: 20,
    supportedSpans: Object.freeze([4, 6, 8] as const),
    minimumHeight: 5,
    interactions: Object.freeze(['filter'] as const),
    accessibilityDescription: Object.freeze({
      vi: 'Biểu đồ tròn với bảng dự phòng',
      en: 'Pie chart with fallback table',
    }),
    evidenceRequired: true,
    fallbackTable: true,
  }),
  Object.freeze({
    type: 'DONUT' as const,
    compatibleFieldTypes: Object.freeze(['number', 'currency', 'string']),
    grains: Object.freeze(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']),
    unitsRequired: true,
    maxRows: 20,
    supportedSpans: Object.freeze([4, 6, 8] as const),
    minimumHeight: 5,
    interactions: Object.freeze(['filter'] as const),
    accessibilityDescription: Object.freeze({
      vi: 'Biểu đồ vành khuyên với bảng dự phòng',
      en: 'Donut chart with fallback table',
    }),
    evidenceRequired: true,
    fallbackTable: true,
  }),
  Object.freeze({
    type: 'TEXT_NOTE' as const,
    compatibleFieldTypes: Object.freeze(['string']),
    grains: Object.freeze(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']),
    unitsRequired: false,
    maxRows: 1,
    supportedSpans: Object.freeze([3, 4, 6] as const),
    minimumHeight: 3,
    interactions: Object.freeze([] as const),
    accessibilityDescription: Object.freeze({ vi: 'Ghi chú văn bản', en: 'Text note' }),
    evidenceRequired: false,
    fallbackTable: true,
  }),
  Object.freeze({
    type: 'EVIDENCE_NOTE' as const,
    compatibleFieldTypes: Object.freeze(['string']),
    grains: Object.freeze(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']),
    unitsRequired: false,
    maxRows: 1,
    supportedSpans: Object.freeze([3, 4, 6] as const),
    minimumHeight: 3,
    interactions: Object.freeze([] as const),
    accessibilityDescription: Object.freeze({
      vi: 'Ghi chú bằng chứng',
      en: 'Evidence note',
    }),
    evidenceRequired: true,
    fallbackTable: true,
  }),
]);

export function findWidgetCatalogEntry(type: string): WidgetCatalogEntryV1 | undefined {
  return WIDGET_CATALOG_V1.find((entry) => entry.type === type);
}
