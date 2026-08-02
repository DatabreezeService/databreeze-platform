import type { DatasetQualityResultV1 } from '@databreeze/domain/dataset-quality/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DATASET_QUALITY_REPOSITORY_PORT = Symbol('DATASET_QUALITY_REPOSITORY_PORT');

export interface DatasetQualityTransactionPortV1 {
  save(context: IamTenantContextV1, result: DatasetQualityResultV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    resultId: DatasetQualityResultV1['resultId'],
  ): Promise<DatasetQualityResultV1 | undefined>;
  list(
    context: IamTenantContextV1,
    datasetVersionId: DatasetQualityResultV1['datasetVersionId'],
  ): Promise<readonly DatasetQualityResultV1[]>;
}

export interface DatasetQualityRepositoryPortV1 extends DatasetQualityTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetQualityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
