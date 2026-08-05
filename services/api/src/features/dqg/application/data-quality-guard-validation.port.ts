import {
  createDataQualityDatasetV1,
  evaluateDataQualityContractV1,
  type DataQualityFindingV1,
  type DataQualityRuleResultV1,
  type DataQualityRunSummaryV1,
} from '@databreeze/domain/data-quality-guard/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DATA_QUALITY_GUARD_VALIDATION_PORT = Symbol('DATA_QUALITY_GUARD_VALIDATION_PORT');

export interface DataQualityGuardValidationInputV1 {
  /** Ephemeral caller input; a port must not retain rows or values. */
  readonly dataset: Parameters<typeof createDataQualityDatasetV1>[0];
  readonly contract: Parameters<typeof evaluateDataQualityContractV1>[1];
}

/** Explicit response projection prevents row values from entering HTTP output. */
export interface DataQualityGuardValidationOutputV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly datasetContentSha256: string;
  readonly contractId: string;
  readonly contractVersion: number;
  readonly contractSha256: string;
  readonly ruleResults: readonly DataQualityRuleResultV1[];
  readonly findings: readonly DataQualityFindingV1[];
  readonly summary: DataQualityRunSummaryV1;
}

export type DataQualityGuardValidationPortResultV1 =
  | { readonly accepted: true; readonly value: DataQualityGuardValidationOutputV1 }
  | { readonly accepted: false; readonly code: 'VALIDATION_REJECTED' | 'VALIDATION_UNAVAILABLE' };

/** Executes deterministic, bounded validation and returns only a value-free projection. */
export interface DataQualityGuardValidationPortV1 {
  validate(
    context: IamTenantContextV1,
    input: DataQualityGuardValidationInputV1,
  ): Promise<DataQualityGuardValidationPortResultV1>;
}
