import {
  createDatasetQualityResultV1,
  type DatasetQualityResultV1,
  type DatasetQualityResultV1Of,
} from '@databreeze/domain/dataset-quality/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DatasetQualityRepositoryPortV1 } from './dataset-quality-repository.port.js';

export type DatasetQualityServiceErrorV1 = 'QUALITY_RESULT_NOT_FOUND';
export type DatasetQualityServiceResultV1<TValue> =
  | DatasetQualityResultV1Of<TValue>
  | { readonly accepted: false; readonly code: DatasetQualityServiceErrorV1 };

/** Coordinates immutable, value-free dataset profiling and validation results. */
export class DatasetQualityService {
  public constructor(private readonly repository: DatasetQualityRepositoryPortV1) {}

  public async register(
    context: IamTenantContextV1,
    input: Parameters<typeof createDatasetQualityResultV1>[0],
  ): Promise<DatasetQualityServiceResultV1<DatasetQualityResultV1>> {
    const created = createDatasetQualityResultV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.resultId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value))
          return Object.freeze({ accepted: true, value: existing });
        throw new Error('DSM_IMMUTABLE_QUALITY_RESULT');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async find(
    context: IamTenantContextV1,
    resultId: DatasetQualityResultV1['resultId'],
  ): Promise<DatasetQualityServiceResultV1<DatasetQualityResultV1>> {
    const found = await this.repository.find(context, resultId);
    return found
      ? Object.freeze({ accepted: true, value: found })
      : Object.freeze({ accepted: false, code: 'QUALITY_RESULT_NOT_FOUND' as const });
  }

  public async list(
    context: IamTenantContextV1,
    datasetVersionId: DatasetQualityResultV1['datasetVersionId'],
  ): Promise<readonly DatasetQualityResultV1[]> {
    return this.repository.withTransaction(context, (transaction) =>
      transaction.list(context, datasetVersionId),
    );
  }
}
