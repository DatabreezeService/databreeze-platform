import type { DdaAnalysisPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';

export type DeterministicNonAnswerV1 =
  | 'SOURCE_UNAVAILABLE'
  | 'STALE_INPUT'
  | 'QUALITY_BLOCKED'
  | 'BUDGET_DENIED'
  | 'ADAPTER_UNAVAILABLE';

export interface DeterministicResultCellV1 {
  readonly cellId: string;
  readonly field: string;
  readonly value: number;
  readonly unit: string;
  readonly planVersionId: string;
  readonly metricVersionId: string;
}

export interface DeterministicResultSuccessV1 {
  readonly resultId: string;
  readonly cells: readonly DeterministicResultCellV1[];
  readonly provenance: {
    readonly planVersionId: string;
    readonly datasetVersionId: string;
    readonly engineVersion: string;
  };
}

export type DeterministicResultResponseV1 =
  | DeterministicResultSuccessV1
  | { readonly status: DeterministicNonAnswerV1 };

export interface DeterministicResultPortV1 {
  execute(input: {
    readonly plan: DdaAnalysisPlanV1;
    readonly tenantScope: unknown;
  }): Promise<DeterministicResultResponseV1>;
}
