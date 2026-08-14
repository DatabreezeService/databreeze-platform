import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import type { GovernedDatasetDefinitionV1 } from '@databreeze/domain/dataset-governance/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const GOVERNED_DATASET_REPOSITORY_PORT = Symbol('GOVERNED_DATASET_REPOSITORY_PORT');

export interface GovernedDatasetTransactionPortV1 {
  save(context: IamTenantContextV1, definition: GovernedDatasetDefinitionV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    versionId: StableIdentifierV1,
  ): Promise<GovernedDatasetDefinitionV1 | undefined>;
  list(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly GovernedDatasetDefinitionV1[]>;
  /** DSM-018: the database query is tenant-filtered; callers still re-check scope. */
  listPublished(context: IamTenantContextV1): Promise<readonly GovernedDatasetDefinitionV1[]>;
}

export interface GovernedDatasetRepositoryPortV1 extends GovernedDatasetTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: GovernedDatasetTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
