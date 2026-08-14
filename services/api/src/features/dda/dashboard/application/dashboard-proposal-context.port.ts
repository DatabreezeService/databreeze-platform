import type { ChartProposalField, DdaDashboardChartProposal } from '@databreeze/contracts/v3';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export type DashboardProposalChartTypeV1 =
  | 'KPI'
  | 'TABLE'
  | 'BAR'
  | 'LINE'
  | 'AREA'
  | 'PIE'
  | 'DONUT'
  | 'TEXT_NOTE'
  | 'EVIDENCE_NOTE';

export interface DashboardProposalContextInputV1 {
  readonly dashboardId: string;
  readonly analysisPlanVersionId: string;
  readonly targetPageId: string;
  readonly targetWidgetId?: string;
}

export interface DashboardProposalTrustedContextV1 {
  readonly dashboardId: string;
  readonly parentVersionId: string;
  readonly expectedRevision: number;
  readonly analysisPlanVersionId: string;
  readonly targetPageId: string;
  readonly targetWidgetId?: string;
  readonly authorizedFields: readonly ChartProposalField[];
  readonly authorizedMetrics: readonly ChartProposalField[];
  readonly resultShapes: readonly string[];
  readonly widgetAllowlist: readonly DashboardProposalChartTypeV1[];
  readonly responsiveRules: {
    readonly supportedSpans: readonly number[];
    readonly defaultSpan: number;
  };
  readonly costBounds: {
    readonly maxOptions: number;
    readonly maxCpuMs: number;
    readonly maxMemoryMb: number;
  };
  readonly binding: DdaDashboardChartProposal['options'][number]['binding'];
}

export type DashboardProposalContextFailureCodeV1 =
  | 'UNAUTHORIZED'
  | 'DASHBOARD_NOT_FOUND'
  | 'ANALYSIS_PLAN_NOT_FOUND'
  | 'TARGET_NOT_FOUND'
  | 'AMBIGUOUS'
  | 'UNAVAILABLE';

export type DashboardProposalContextResolutionV1 =
  | { readonly accepted: true; readonly value: DashboardProposalTrustedContextV1 }
  | { readonly accepted: false; readonly code: DashboardProposalContextFailureCodeV1 };

export interface DashboardProposalContextPortV1 {
  resolve(
    context: IamTenantContextV1,
    input: DashboardProposalContextInputV1,
  ): Promise<DashboardProposalContextResolutionV1>;
}

/** Default production-safe behavior until a dashboard authority composition is supplied. */
export class UnavailableDashboardProposalContextAdapter implements DashboardProposalContextPortV1 {
  public resolve(): Promise<DashboardProposalContextResolutionV1> {
    return Promise.resolve(
      Object.freeze({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    );
  }
}
