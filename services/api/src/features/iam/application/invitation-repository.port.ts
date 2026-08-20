import type { InvitationTokenV1 } from '@databreeze/domain/invitation/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamMembershipRecordV1 } from './iam-repository.port.js';
import type { IamTenantContextV1 } from './tenant-context.js';

export const IAM_INVITATION_REPOSITORY_PORT = Symbol('IAM_INVITATION_REPOSITORY_PORT');

export interface IamInvitationTransactionPortV1 {
  findMembershipForPrincipal(
    context: IamTenantContextV1,
    principalId: StableIdentifierV1,
  ): Promise<IamMembershipRecordV1 | undefined>;
  /** Find a prior invited membership so a failed delivery can be retried without creating a duplicate identity. */
  findInvitedMembershipForPrincipal?(
    context: IamTenantContextV1,
    principalId: StableIdentifierV1,
  ): Promise<IamMembershipRecordV1 | undefined>;
  findMembershipById(
    context: IamTenantContextV1,
    membershipId: StableIdentifierV1,
  ): Promise<IamMembershipRecordV1 | undefined>;
  findInvitationByDigest(
    context: IamTenantContextV1,
    tokenDigest: string,
  ): Promise<InvitationTokenV1 | undefined>;
  findActiveInvitationForMembership(
    context: IamTenantContextV1,
    membershipId: StableIdentifierV1,
  ): Promise<InvitationTokenV1 | undefined>;
  isDeliveryBlocked?(context: IamTenantContextV1, tokenDigest: string): Promise<boolean>;
  recordDeliveryFailure?(
    context: IamTenantContextV1,
    tokenDigest: string,
    recordedAt: string,
  ): Promise<void>;
  saveInvitation(context: IamTenantContextV1, invitation: InvitationTokenV1): Promise<void>;
  saveMembership(context: IamTenantContextV1, membership: IamMembershipRecordV1): Promise<void>;
}

export interface IamInvitationRepositoryPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: IamInvitationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
