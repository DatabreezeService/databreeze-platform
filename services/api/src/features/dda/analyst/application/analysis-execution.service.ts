import type { DdaAnalysisPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { AnalysisNonAnswerReasonV1 } from './analysis-proposal.service.js';
import type {
  DeterministicResultCellV1,
  DeterministicResultPortV1,
} from './deterministic-result.port.js';

export interface NarrativeClaimInputV1 {
  readonly text: string;
  readonly resultCellIds: readonly string[];
}

export type AnalysisExecutionResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly resultId: string;
        readonly cells: readonly DeterministicResultCellV1[];
        readonly narrative: readonly {
          readonly text: string;
          readonly resultCellIds: readonly string[];
        }[];
        readonly provenance: {
          readonly planVersionId: string;
          readonly datasetVersionId: string;
          readonly engineVersion: string;
        };
      };
    }
  | { readonly accepted: false; readonly code: AnalysisNonAnswerReasonV1 };

/** DDA-015/019: execute typed plans through deterministic ports; narratives bind to cells. */
export class AnalysisExecutionServiceV1 {
  public constructor(private readonly results: DeterministicResultPortV1) {}

  public async execute(
    context: IamTenantContextV1,
    input: {
      readonly plan: DdaAnalysisPlanV1;
      readonly narrativeClaims: readonly NarrativeClaimInputV1[];
    },
  ): Promise<AnalysisExecutionResultV1> {
    for (const claim of input.narrativeClaims) {
      if (!claim.resultCellIds || claim.resultCellIds.length === 0) {
        return Object.freeze({ accepted: false, code: 'UNSUPPORTED_PLAN' as const });
      }
    }

    const response = await this.results.execute({
      plan: input.plan,
      tenantScope: context.tenantScope,
      context,
    });
    if ('status' in response) {
      return Object.freeze({ accepted: false, code: response.status });
    }

    const cellIds = new Set(response.cells.map((cell) => cell.cellId));
    for (const claim of input.narrativeClaims) {
      if (claim.resultCellIds.some((id) => !cellIds.has(id))) {
        return Object.freeze({ accepted: false, code: 'UNSUPPORTED_PLAN' as const });
      }
    }

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        resultId: response.resultId,
        cells: response.cells,
        narrative: Object.freeze(
          input.narrativeClaims.map((claim) =>
            Object.freeze({
              text: claim.text,
              resultCellIds: Object.freeze([...claim.resultCellIds]),
            }),
          ),
        ),
        provenance: response.provenance,
      }),
    });
  }
}
