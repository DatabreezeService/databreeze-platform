import type { ServiceAccountV1 } from '@databreeze/domain/service-account/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from './tenant-context.js';

export const SERVICE_ACCOUNT_REPOSITORY_PORT = Symbol('SERVICE_ACCOUNT_REPOSITORY_PORT');

export interface ServiceAccountTransactionPortV1 {
  findServiceAccount(
    context: IamTenantContextV1,
    serviceAccountId: StableIdentifierV1,
  ): Promise<ServiceAccountV1 | undefined>;
  listServiceAccounts(context: IamTenantContextV1): Promise<readonly ServiceAccountV1[]>;
  saveServiceAccount(context: IamTenantContextV1, account: ServiceAccountV1): Promise<void>;
  replaceServiceAccount(
    context: IamTenantContextV1,
    account: ServiceAccountV1,
    expectedRevision: number,
  ): Promise<void>;
}

export interface ServiceAccountRepositoryPortV1 extends ServiceAccountTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ServiceAccountTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
