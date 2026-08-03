import {
  tenantScopeContainsV1,
  type EntitlementLeaseV1,
} from '@databreeze/domain/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  EntitlementLeaseRepositoryPortV1,
  EntitlementLeaseTransactionPortV1,
} from '../application/entitlement-lease-repository.port.js';

function leaseScope(lease: EntitlementLeaseV1) {
  return lease.tenantScope;
}

function clone(lease: EntitlementLeaseV1): EntitlementLeaseV1 {
  return Object.freeze({ ...lease, tenantScope: Object.freeze({ ...lease.tenantScope }) });
}

/** BUA local adapter with immutable lease identity and tenant visibility checks. */
export class InMemoryEntitlementLeaseRepositoryAdapter implements EntitlementLeaseRepositoryPortV1 {
  private leases = new Map<string, EntitlementLeaseV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async saveLease(context: IamTenantContextV1, lease: EntitlementLeaseV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, leaseScope(lease)))
      throw new Error('BUA_SCOPE_NARROWING_REQUIRED');
    const existing = this.leases.get(lease.leaseId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(lease))
      throw new Error('BUA_IMMUTABLE_LEASE');
    this.leases.set(lease.leaseId, clone(lease));
  }

  public async findLease(
    context: IamTenantContextV1,
    leaseId: EntitlementLeaseV1['leaseId'],
  ): Promise<EntitlementLeaseV1 | undefined> {
    await Promise.resolve();
    const lease = this.leases.get(leaseId);
    return lease && (tenantScopeContainsV1(context.tenantScope, leaseScope(lease)) || tenantScopeContainsV1(leaseScope(lease), context.tenantScope))
      ? clone(lease)
      : undefined;
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: EntitlementLeaseTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.leases);
    try {
      return await work({ saveLease: this.saveLease.bind(this), findLease: this.findLease.bind(this) });
    } catch (error) {
      this.leases = before;
      throw error;
    } finally {
      release();
    }
  }
}
