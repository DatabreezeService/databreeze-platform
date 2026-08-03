import {
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { InvitationTokenV1 } from '@databreeze/domain/invitation/v1';

import type { IamMembershipRecordV1 } from '../application/iam-repository.port.js';
import type {
  IamInvitationRepositoryPortV1,
  IamInvitationTransactionPortV1,
} from '../application/invitation-repository.port.js';
import type { IamTenantContextV1 } from '../application/tenant-context.js';
import { selectAuthoritativeMembership } from '../application/membership-authority.js';

function visible(context: TenantScopeV1, target: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, target) || tenantScopeContainsV1(target, context);
}

function cloneMembership(record: IamMembershipRecordV1): IamMembershipRecordV1 {
  return Object.freeze({ ...record, scope: Object.freeze({ ...record.scope }) });
}

function cloneInvitation(record: InvitationTokenV1): InvitationTokenV1 {
  return Object.freeze({ ...record, scope: Object.freeze({ ...record.scope }) });
}

function sameInvitationIdentity(left: InvitationTokenV1, right: InvitationTokenV1): boolean {
  return (
    left.membershipId === right.membershipId &&
    left.principalId === right.principalId &&
    tenantScopesEqualV1(left.scope, right.scope) &&
    left.roleId === right.roleId &&
    left.tokenDigest === right.tokenDigest &&
    left.emailDigest === right.emailDigest &&
    left.issuedAt === right.issuedAt &&
    left.expiresAt === right.expiresAt
  );
}

/** Test/local adapter that mirrors the scoped and compare-and-set rules of PostgreSQL. */
export class InMemoryIamInvitationRepositoryAdapter implements IamInvitationRepositoryPortV1 {
  private memberships: IamMembershipRecordV1[];
  private invitations: InvitationTokenV1[] = [];
  private transactionTail: Promise<void> = Promise.resolve();

  public constructor(memberships: readonly IamMembershipRecordV1[] = []) {
    this.memberships = memberships.map(cloneMembership);
  }

  public seedMemberships(memberships: readonly IamMembershipRecordV1[]): void {
    this.memberships = memberships.map(cloneMembership);
  }

  public async withTransaction<TValue>(
    _context: IamTenantContextV1,
    work: (transaction: IamInvitationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const prior = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    const membershipsBefore = this.memberships.map(cloneMembership);
    const invitationsBefore = this.invitations.map(cloneInvitation);
    try {
      return await work({
        findMembershipForPrincipal: this.findMembershipForPrincipal.bind(this),
        findMembershipById: this.findMembershipById.bind(this),
        findInvitationByDigest: this.findInvitationByDigest.bind(this),
        findActiveInvitationForMembership: this.findActiveInvitationForMembership.bind(this),
        saveInvitation: this.saveInvitation.bind(this),
        saveMembership: this.saveMembership.bind(this),
      });
    } catch (error) {
      this.memberships = membershipsBefore;
      this.invitations = invitationsBefore;
      throw error;
    } finally {
      release();
    }
  }

  private async findMembershipForPrincipal(
    context: IamTenantContextV1,
    principalId: StableIdentifierV1,
  ): Promise<IamMembershipRecordV1 | undefined> {
    const visibleMemberships = this.memberships.filter((membership) =>
      visible(context.tenantScope, membership.scope),
    );
    return selectAuthoritativeMembership(visibleMemberships, context, principalId);
  }

  private async findMembershipById(
    context: IamTenantContextV1,
    membershipId: StableIdentifierV1,
  ): Promise<IamMembershipRecordV1 | undefined> {
    const membership = this.memberships.find((item) => item.id === membershipId);
    return membership && visible(context.tenantScope, membership.scope)
      ? cloneMembership(membership)
      : undefined;
  }

  private async findInvitationByDigest(
    context: IamTenantContextV1,
    tokenDigest: string,
  ): Promise<InvitationTokenV1 | undefined> {
    const invitation = this.invitations.find(
      (item) =>
        item.tokenDigest === tokenDigest && tenantScopeContainsV1(context.tenantScope, item.scope),
    );
    return invitation ? cloneInvitation(invitation) : undefined;
  }

  private async findActiveInvitationForMembership(
    context: IamTenantContextV1,
    membershipId: StableIdentifierV1,
  ): Promise<InvitationTokenV1 | undefined> {
    const invitation = this.invitations.find(
      (item) =>
        item.membershipId === membershipId &&
        item.status === 'ACTIVE' &&
        tenantScopeContainsV1(context.tenantScope, item.scope),
    );
    return invitation ? cloneInvitation(invitation) : undefined;
  }

  private async saveInvitation(
    context: IamTenantContextV1,
    invitation: InvitationTokenV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, invitation.scope))
      throw new Error('IAM_SCOPE_NARROWING_REQUIRED');
    const existing = this.invitations.find((item) => item.id === invitation.id);
    if (!existing) {
      if (this.invitations.some((item) => item.tokenDigest === invitation.tokenDigest))
        throw new Error('IAM_INVITATION_CONFLICT');
      if (
        this.invitations.some(
          (item) => item.membershipId === invitation.membershipId && item.status === 'ACTIVE',
        )
      )
        throw new Error('IAM_INVITATION_CONFLICT');
      this.invitations.push(cloneInvitation(invitation));
      return;
    }
    if (!sameInvitationIdentity(existing, invitation))
      throw new Error('IAM_INVITATION_SCOPE_IMMUTABLE');
    if (invitation.revision !== existing.revision + 1)
      throw new Error('IAM_INVITATION_REVISION_CONFLICT');
    if (existing.status !== 'ACTIVE' || invitation.status === 'ACTIVE')
      throw new Error('IAM_INVITATION_REVISION_CONFLICT');
    this.invitations = this.invitations.map((item) =>
      item.id === invitation.id ? cloneInvitation(invitation) : item,
    );
  }

  private async saveMembership(
    context: IamTenantContextV1,
    membership: IamMembershipRecordV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, membership.scope))
      throw new Error('IAM_SCOPE_NARROWING_REQUIRED');
    const index = this.memberships.findIndex((item) => item.id === membership.id);
    if (index < 0) throw new Error('IAM_REVISION_CONFLICT');
    const existing = this.memberships[index];
    if (!existing) throw new Error('IAM_REVISION_CONFLICT');
    if (
      existing.principalId !== membership.principalId ||
      !tenantScopesEqualV1(existing.scope, membership.scope) ||
      existing.roleId !== membership.roleId
    )
      throw new Error('IAM_MEMBERSHIP_SCOPE_IMMUTABLE');
    if (membership.revision !== existing.revision + 1) throw new Error('IAM_REVISION_CONFLICT');
    this.memberships = this.memberships.map((item, itemIndex) =>
      itemIndex === index ? cloneMembership(membership) : item,
    );
  }
}
