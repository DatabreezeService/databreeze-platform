import type { DdaAnalysisPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { NarrativeClaimInputV1 } from '../application/analysis-execution.service.js';

export interface AnalysisProposeDtoV1 {
  readonly context: IamTenantContextV1;
  readonly request: Record<string, unknown>;
}

export interface AnalysisExecuteDtoV1 {
  readonly context: IamTenantContextV1;
  readonly plan: DdaAnalysisPlanV1;
  readonly narrativeClaims?: readonly NarrativeClaimInputV1[];
}
