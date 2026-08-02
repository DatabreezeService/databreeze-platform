import { tenantScopeContainsV1, type EvidenceAccessGrantV1, type TenantScopeV1 } from '@databreeze/domain/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { EvidenceGrantRepositoryPortV1, EvidenceGrantTransactionPortV1 } from '../application/evidence-grant-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function clone(grant: EvidenceAccessGrantV1): EvidenceAccessGrantV1 {
  return Object.freeze({ ...grant, tenantScope: Object.freeze({ ...grant.tenantScope }) });
}

export class InMemoryEvidenceGrantRepositoryAdapter implements EvidenceGrantRepositoryPortV1 {
  private grants = new Map<string, EvidenceAccessGrantV1>();
  private revoked = new Set<string>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, grant: EvidenceAccessGrantV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, grant.tenantScope)) throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = this.grants.get(grant.grantId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(grant)) throw new Error('IAE_IMMUTABLE_GRANT');
    this.grants.set(grant.grantId, clone(grant));
  }

  public async find(context: IamTenantContextV1, grantId: StableIdentifierV1): Promise<EvidenceAccessGrantV1 | undefined> {
    await Promise.resolve();
    const grant = this.grants.get(grantId);
    return grant && visible(context.tenantScope, grant.tenantScope) ? clone(grant) : undefined;
  }

  public async revoke(context: IamTenantContextV1, grantId: StableIdentifierV1): Promise<void> {
    const grant = await this.find(context, grantId);
    if (!grant) throw new Error('IAE_GRANT_NOT_FOUND');
    this.revoked.add(grantId);
  }

  public async isRevoked(context: IamTenantContextV1, grantId: StableIdentifierV1): Promise<boolean> {
    const grant = await this.find(context, grantId);
    return grant !== undefined && this.revoked.has(grantId);
  }

  public async withTransaction<TValue>(context: IamTenantContextV1, work: (transaction: EvidenceGrantTransactionPortV1) => Promise<TValue>): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const beforeGrants = new Map(this.grants);
    const beforeRevoked = new Set(this.revoked);
    try {
      return await work({ save: this.save.bind(this), find: this.find.bind(this), revoke: this.revoke.bind(this), isRevoked: this.isRevoked.bind(this) });
    } catch (error) {
      this.grants = beforeGrants;
      this.revoked = beforeRevoked;
      throw error;
    } finally {
      release();
    }
  }
}
