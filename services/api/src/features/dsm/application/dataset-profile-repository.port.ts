import type { DatasetProfileV1 } from '@databreeze/domain/dataset-profile/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DATASET_PROFILE_REPOSITORY_PORT = Symbol('DATASET_PROFILE_REPOSITORY_PORT');

export interface DatasetProfileTransactionPortV1 {
  save(context: IamTenantContextV1, profile: DatasetProfileV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    profileId: DatasetProfileV1['profileId'],
  ): Promise<DatasetProfileV1 | undefined>;
  list(
    context: IamTenantContextV1,
    datasetVersionId: DatasetProfileV1['datasetVersionId'],
  ): Promise<readonly DatasetProfileV1[]>;
}

export interface DatasetProfileRepositoryPortV1 extends DatasetProfileTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetProfileTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
