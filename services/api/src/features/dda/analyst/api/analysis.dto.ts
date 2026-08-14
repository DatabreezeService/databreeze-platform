import type { DdaAnalysisPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type { NarrativeClaimInputV1 } from '../application/analysis-execution.service.js';

export interface AnalysisProposeDtoV1 {
  readonly request: Record<string, unknown>;
}

export interface AnalysisExecuteDtoV1 {
  readonly plan: DdaAnalysisPlanV1;
  readonly narrativeClaims?: readonly NarrativeClaimInputV1[];
}
