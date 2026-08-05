import {
  createDataQualityDatasetV1,
  evaluateDataQualityContractV1,
  type DataQualityRunV1,
} from '@databreeze/domain/data-quality-guard/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DataQualityGuardValidationInputV1,
  DataQualityGuardValidationOutputV1,
  DataQualityGuardValidationPortResultV1,
  DataQualityGuardValidationPortV1,
} from '../application/data-quality-guard-validation.port.js';

function safeOutput(run: DataQualityRunV1): DataQualityGuardValidationOutputV1 {
  return Object.freeze({
    schemaVersion: run.schemaVersion,
    runId: run.runId,
    datasetId: run.datasetId,
    datasetVersionId: run.datasetVersionId,
    datasetContentSha256: run.datasetContentSha256,
    contractId: run.contractId,
    contractVersion: run.contractVersion,
    contractSha256: run.contractSha256,
    ruleResults: Object.freeze([...run.ruleResults]),
    findings: Object.freeze([...run.findings]),
    summary: run.summary,
  });
}

/**
 * Calls the public deterministic domain functions in-process. It has no
 * storage dependency and deliberately omits the caller's raw rows from output.
 */
export class InProcessDataQualityGuardValidationAdapter
  implements DataQualityGuardValidationPortV1
{
  public validate(
    context: IamTenantContextV1,
    input: DataQualityGuardValidationInputV1,
  ): Promise<DataQualityGuardValidationPortResultV1> {
    void context;
    try {
      const dataset = createDataQualityDatasetV1(input.dataset);
      const run = evaluateDataQualityContractV1(dataset, input.contract);
      return Promise.resolve(Object.freeze({ accepted: true, value: safeOutput(run) }));
    } catch (error) {
      if (
        error instanceof Error &&
        ['INVALID_DATASET', 'INVALID_CONTRACT', 'INVALID_RULE', 'DUPLICATE_RULE_ID'].includes(
          error.message,
        )
      )
        return Promise.resolve(
          Object.freeze({ accepted: false, code: 'VALIDATION_REJECTED' as const }),
        );
      return Promise.resolve(
        Object.freeze({ accepted: false, code: 'VALIDATION_UNAVAILABLE' as const }),
      );
    }
  }
}
