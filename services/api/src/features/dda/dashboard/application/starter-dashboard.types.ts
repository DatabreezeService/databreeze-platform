export type StarterDashboardProfileV1 =
  | 'SALES_TIME_SERIES'
  | 'EXPENSE_RECEIPT'
  | 'INVENTORY'
  | 'GENERIC_TABLE';

export type StarterWidgetTypeV1 =
  | 'KPI'
  | 'TABLE'
  | 'BAR'
  | 'LINE'
  | 'AREA'
  | 'DONUT'
  | 'TEXT_EVIDENCE';

export interface StarterDashboardTemplateV1 {
  readonly templateId: string;
  readonly version: 1;
  readonly requiredRoles: readonly string[];
  readonly widgets: readonly {
    readonly widgetId: string;
    readonly type: StarterWidgetTypeV1;
    readonly title: { readonly vi: string; readonly en: string };
  }[];
  readonly aiUsed: false;
}

export type StarterDashboardMatchResultV1 =
  | { readonly accepted: true; readonly value: StarterDashboardTemplateV1 }
  | { readonly accepted: false; readonly code: 'NO_SAFE_TEMPLATE' };

export interface StarterDashboardRecordV1 {
  readonly dashboardVersionId: string;
  readonly datasetVersionId: string;
  readonly templateId: string;
  readonly visibility: 'PRIVATE';
  readonly published: false;
  readonly aiUsed: false;
}

export type StarterDashboardProblemCodeV1 =
  | 'NO_SAFE_TEMPLATE'
  | 'UNAUTHORIZED'
  | 'RESTRICTED_METRIC';
