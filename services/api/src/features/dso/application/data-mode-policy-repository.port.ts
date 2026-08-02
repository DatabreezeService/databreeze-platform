import type { DataModePolicyVersionV1 } from '@databreeze/domain/data-mode/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DATA_MODE_POLICY_REPOSITORY_PORT = Symbol('DATA_MODE_POLICY_REPOSITORY_PORT');

export interface DataModePolicyTransactionPortV1 {
  save(context: IamTenantContextV1, policy: DataModePolicyVersionV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    policyVersionId: StableIdentifierV1,
  ): Promise<DataModePolicyVersionV1 | undefined>;
  list(
    context: IamTenantContextV1,
    policyId: StableIdentifierV1,
  ): Promise<readonly DataModePolicyVersionV1[]>;
}

export interface DataModePolicyRepositoryPortV1 extends DataModePolicyTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DataModePolicyTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
