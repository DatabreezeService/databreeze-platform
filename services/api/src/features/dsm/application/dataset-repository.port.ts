import type { DatasetDefinitionV1 } from '@databreeze/domain/dataset/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DATASET_REPOSITORY_PORT = Symbol('DATASET_REPOSITORY_PORT');

export interface DatasetTransactionPortV1 {
  save(context: IamTenantContextV1, definition: DatasetDefinitionV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    versionId: StableIdentifierV1,
  ): Promise<DatasetDefinitionV1 | undefined>;
  list(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly DatasetDefinitionV1[]>;
}

export interface DatasetRepositoryPortV1 extends DatasetTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
