import type {
  BusinessPartyResolutionV1,
  BusinessPartyVersionV1,
} from '@databreeze/domain/reference-entity/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const REFERENCE_ENTITY_REPOSITORY_PORT = Symbol('REFERENCE_ENTITY_REPOSITORY_PORT');

export interface ReferenceEntityTransactionPortV1 {
  saveVersion(context: IamTenantContextV1, version: BusinessPartyVersionV1): Promise<void>;
  findVersion(
    context: IamTenantContextV1,
    versionId: StableIdentifierV1,
  ): Promise<BusinessPartyVersionV1 | undefined>;
  findLatest(
    context: IamTenantContextV1,
    entityId: StableIdentifierV1,
  ): Promise<BusinessPartyVersionV1 | undefined>;
  listVersions(
    context: IamTenantContextV1,
    entityId: StableIdentifierV1,
  ): Promise<readonly BusinessPartyVersionV1[]>;
  saveResolution(context: IamTenantContextV1, resolution: BusinessPartyResolutionV1): Promise<void>;
  listResolutions(
    context: IamTenantContextV1,
    entityId: StableIdentifierV1,
  ): Promise<readonly BusinessPartyResolutionV1[]>;
}

export interface ReferenceEntityRepositoryPortV1 extends ReferenceEntityTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ReferenceEntityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
