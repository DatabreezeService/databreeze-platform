import type { MappingDefinitionV1 } from '@databreeze/domain/mapping/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const MAPPING_REPOSITORY_PORT = Symbol('MAPPING_REPOSITORY_PORT');

export interface MappingTransactionPortV1 {
  save(context: IamTenantContextV1, definition: MappingDefinitionV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    versionId: StableIdentifierV1,
  ): Promise<MappingDefinitionV1 | undefined>;
  list(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly MappingDefinitionV1[]>;
}

export interface MappingRepositoryPortV1 extends MappingTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: MappingTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
