import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { DashboardProposalChartTypeV1 } from './dashboard-proposal-context.port.js';

/** Provider-facing proposal shape. It is intentionally broader than the public contract so the service can normalize legacy groupings. */
export interface DashboardProposalWidgetV1 {
  readonly widgetId: string;
  readonly type: string;
  readonly pageId: string;
  readonly title: { readonly vi: string; readonly en: string };
  readonly bindings: readonly string[];
  readonly assumptions?: readonly string[];
  readonly estimate?: { readonly cpuMs: number; readonly memoryMb: number };
  readonly evidenceBehavior?: 'REQUIRED' | 'OPTIONAL' | 'UNAVAILABLE';
}

export interface DashboardProposalV1 {
  readonly status: 'PROPOSED' | 'FAILED';
  readonly pages: readonly {
    readonly pageId: string;
    readonly title: { readonly vi: string; readonly en: string };
  }[];
  readonly widgets: readonly DashboardProposalWidgetV1[];
  readonly filters: readonly {
    readonly filterId: string;
    readonly field: string;
    readonly operator: string;
  }[];
  readonly options?: readonly unknown[];
  readonly summary?: { readonly vi: string; readonly en: string };
  readonly rationale?: string;
  readonly assumptions?: readonly string[];
  readonly code?: string;
}

/** The old optional-AI request shape remains accepted for local outage tests only. */
export interface DashboardProposalRequestV1 {
  readonly tenantScope?: TenantScopeV1;
  readonly analysisPlanId?: string;
  readonly authorizedFields?: readonly string[];
  readonly authorizedMetrics?: readonly string[];
  readonly widgetAllowlist?: readonly DashboardProposalChartTypeV1[] | readonly string[];
  readonly locale?: 'vi' | 'en';
  readonly resultShapes?: readonly string[];
  readonly accessibilityRules?: readonly string[];
  readonly responsiveConstraints?: readonly string[];
  readonly costBounds?: { readonly maxWidgets: number; readonly maxPages: number };
  readonly question?: string;
  readonly dashboardId?: string;
  readonly parentVersionId?: string;
  readonly expectedRevision?: number;
  readonly analysisPlanVersionId?: string;
  readonly targetPageId?: string;
  readonly targetWidgetId?: string;
  readonly authorizedFieldLabels?: readonly {
    readonly id: string;
    readonly label: { readonly vi: string; readonly en: string };
  }[];
  readonly authorizedMetricLabels?: readonly {
    readonly id: string;
    readonly label: { readonly vi: string; readonly en: string };
  }[];
  readonly responsiveRules?: {
    readonly supportedSpans: readonly number[];
    readonly defaultSpan: number;
  };
  readonly trustedBinding?: {
    readonly analysisPlanVersionId: string;
    readonly materializationDefinitionId: string;
    readonly dimensionIds: readonly string[];
    readonly measureIds: readonly string[];
  };
}

export interface DashboardProposalPortV1 {
  isAvailable(): Promise<boolean>;
  proposeDashboard(input: DashboardProposalRequestV1): Promise<DashboardProposalV1>;
}
