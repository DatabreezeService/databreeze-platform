import type { DatasetVersionManifestV1 } from '@databreeze/domain/dataset-governance/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DATASET_VERSION_REPOSITORY_PORT = Symbol('DATASET_VERSION_REPOSITORY_PORT');

export interface DatasetVersionTransactionPortV1 {
  save(context: IamTenantContextV1, version: DatasetVersionManifestV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    versionId: DatasetVersionManifestV1['versionId'],
  ): Promise<DatasetVersionManifestV1 | undefined>;
}

export interface DatasetVersionRepositoryPortV1 extends DatasetVersionTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetVersionTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
