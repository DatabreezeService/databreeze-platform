import type {
  StableIdentifierV1,
  StrictUtcTimestampV1,
  TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from './tenant-context.js';

export const IAM_REPOSITORY_PORT = Symbol('IAM_REPOSITORY_PORT');

export interface IamMembershipRecordV1 {
  readonly id: StableIdentifierV1;
  readonly principalId: StableIdentifierV1;
  readonly scope: TenantScopeV1;
  readonly roleId: string;
  readonly status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
  readonly startsAt?: StrictUtcTimestampV1;
  readonly expiresAt?: StrictUtcTimestampV1;
  readonly revision: number;
}

export interface IamTransactionPortV1 {
  findMembership(
    context: IamTenantContextV1,
    principalId: StableIdentifierV1,
  ): Promise<IamMembershipRecordV1 | undefined>;
  listMemberships(context: IamTenantContextV1): Promise<readonly IamMembershipRecordV1[]>;
  saveMembership(context: IamTenantContextV1, membership: IamMembershipRecordV1): Promise<void>;
}

export interface IamRepositoryPortV1 extends IamTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: IamTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
