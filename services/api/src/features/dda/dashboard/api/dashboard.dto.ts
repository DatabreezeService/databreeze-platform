import type { DdaDashboardAuthoringCommand } from '@databreeze/contracts/v3';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

/** Generated closed command union. Tenant context is always resolved from the request. */
export type DashboardAuthoringCommandDtoV1 = DdaDashboardAuthoringCommand;

export interface AcceptDashboardProposalDtoV1 {
  readonly context: IamTenantContextV1;
  readonly proposalId: string;
  readonly version: Record<string, unknown>;
  readonly proposalSummary?: {
    readonly affectedPages: readonly string[];
    readonly affectedWidgets: readonly string[];
    readonly beforeAfter: string;
    readonly assumptions: readonly string[];
    readonly estimatedCost: { readonly cpuMs: number; readonly memoryMb: number };
  };
}

export interface RestoreDashboardWidgetDtoV1 {
  readonly context: IamTenantContextV1;
  readonly dashboardId: string;
  readonly versionId: string;
  readonly widgetId: string;
}

export interface ApplyDashboardFilterDtoV1 {
  readonly context: IamTenantContextV1;
  readonly dashboardId: string;
  readonly versionId: string;
  readonly filter: {
    readonly filterId: string;
    readonly field: string;
    readonly operator: string;
    readonly scope: 'DASHBOARD' | 'PAGE' | 'WIDGET';
    readonly silentCertifiedMutation?: boolean;
  };
}
