import {
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  IamMembershipRecordV1,
  IamRepositoryPortV1,
  IamTransactionPortV1,
} from '../application/iam-repository.port.js';
import type { IamTenantContextV1 } from '../application/tenant-context.js';
import { selectAuthoritativeMembership } from '../application/membership-authority.js';

function visibleInScope(context: TenantScopeV1, membership: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, membership) || tenantScopeContainsV1(membership, context);
}

function cloneMemberships(source: readonly IamMembershipRecordV1[]): IamMembershipRecordV1[] {
  return source.map((membership) =>
    Object.freeze({ ...membership, scope: { ...membership.scope } }),
  );
}

/** Test adapter with the same scope checks expected from a PostgreSQL repository. */
export class InMemoryIamRepositoryAdapter implements IamRepositoryPortV1 {
  private memberships: IamMembershipRecordV1[] = [];
  private transactionTail: Promise<void> = Promise.resolve();

  seed(memberships: readonly IamMembershipRecordV1[]): void {
    this.memberships = cloneMemberships(memberships);
  }

  async findMembership(
    context: IamTenantContextV1,
    principalId: StableIdentifierV1,
  ): Promise<IamMembershipRecordV1 | undefined> {
    await Promise.resolve();
    return selectAuthoritativeMembership(this.memberships, context, principalId);
  }

  async listMemberships(context: IamTenantContextV1): Promise<readonly IamMembershipRecordV1[]> {
    await Promise.resolve();
    return this.memberships.filter((membership) =>
      visibleInScope(context.tenantScope, membership.scope),
    );
  }

  async saveMembership(
    context: IamTenantContextV1,
    membership: IamMembershipRecordV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, membership.scope))
      throw new Error('IAM_SCOPE_NARROWING_REQUIRED');
    const existing = this.memberships.find((item) => item.id === membership.id);
    const duplicate = this.memberships.find(
      (item) =>
        item.id !== membership.id &&
        item.principalId === membership.principalId &&
        tenantScopesEqualV1(item.scope, membership.scope),
    );
    if (duplicate) throw new Error('IAM_MEMBERSHIP_CONFLICT');
    if (existing && context.expectedRevision !== existing.revision)
      throw new Error('IAM_REVISION_CONFLICT');
    if (!existing && context.expectedRevision !== undefined)
      throw new Error('IAM_REVISION_CONFLICT');
    this.memberships = existing
      ? this.memberships.map((item) =>
          item.id === membership.id ? Object.freeze({ ...membership }) : item,
        )
      : [...this.memberships, Object.freeze({ ...membership })];
  }

  async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: IamTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = cloneMemberships(this.memberships);
    try {
      return await work({
        findMembership: this.findMembership.bind(this),
        listMemberships: this.listMemberships.bind(this),
        saveMembership: this.saveMembership.bind(this),
      });
    } catch (error) {
      this.memberships = before;
      throw error;
    } finally {
      release();
    }
  }
}
