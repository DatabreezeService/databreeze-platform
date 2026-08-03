import type { EntitlementLeaseV1 } from '@databreeze/domain/entitlements/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const ENTITLEMENT_LEASE_REPOSITORY_PORT = Symbol('ENTITLEMENT_LEASE_REPOSITORY_PORT');

export interface EntitlementLeaseTransactionPortV1 {
  saveLease(context: IamTenantContextV1, lease: EntitlementLeaseV1): Promise<void>;
  findLease(
    context: IamTenantContextV1,
    leaseId: StableIdentifierV1,
  ): Promise<EntitlementLeaseV1 | undefined>;
}

export interface EntitlementLeaseRepositoryPortV1 extends EntitlementLeaseTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: EntitlementLeaseTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
