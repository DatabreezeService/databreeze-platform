import { tenantScopeContainsV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { ServiceAccountV1 } from '@databreeze/domain/service-account/v1';
import type { IamTenantContextV1 } from '../application/tenant-context.js';
import type {
  ServiceAccountRepositoryPortV1,
  ServiceAccountTransactionPortV1,
} from '../application/service-account-repository.port.js';

function accountScope(account: ServiceAccountV1): TenantScopeV1 {
  return account.workspaceId === undefined
    ? { scopeType: 'organization', organizationId: account.organizationId }
    : {
        scopeType: 'workspace',
        organizationId: account.organizationId,
        workspaceId: account.workspaceId,
      };
}

function visibleInScope(context: IamTenantContextV1, account: ServiceAccountV1): boolean {
  const scope = accountScope(account);
  return (
    tenantScopeContainsV1(context.tenantScope, scope) ||
    tenantScopeContainsV1(scope, context.tenantScope)
  );
}

function writableInScope(context: IamTenantContextV1, account: ServiceAccountV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, accountScope(account));
}

function clone(account: ServiceAccountV1): ServiceAccountV1 {
  return Object.freeze({ ...account, permissions: Object.freeze([...account.permissions]) });
}

/** Deterministic local adapter with the same visibility and optimistic-write rules as PostgreSQL. */
export class InMemoryServiceAccountRepositoryAdapter implements ServiceAccountRepositoryPortV1 {
  private accounts = new Map<string, ServiceAccountV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async findServiceAccount(
    context: IamTenantContextV1,
    serviceAccountId: ServiceAccountV1['id'],
  ): Promise<ServiceAccountV1 | undefined> {
    await Promise.resolve();
    const account = this.accounts.get(serviceAccountId);
    return account && visibleInScope(context, account) ? clone(account) : undefined;
  }

  public async findServiceAccountByDigest(
    context: IamTenantContextV1,
    secretDigest: string,
  ): Promise<ServiceAccountV1 | undefined> {
    await Promise.resolve();
    const account = [...this.accounts.values()].find(
      (candidate) => candidate.secretDigest === secretDigest && visibleInScope(context, candidate),
    );
    return account ? clone(account) : undefined;
  }

  public async listServiceAccounts(
    context: IamTenantContextV1,
  ): Promise<readonly ServiceAccountV1[]> {
    await Promise.resolve();
    return [...this.accounts.values()]
      .filter((account) => visibleInScope(context, account))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(clone);
  }

  public async saveServiceAccount(
    context: IamTenantContextV1,
    account: ServiceAccountV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!writableInScope(context, account)) throw new Error('SCOPE_DENIED');
    const existing = this.accounts.get(account.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(account))
        throw new Error('IMMUTABLE_SERVICE_ACCOUNT');
      return;
    }
    const duplicateDigest = [...this.accounts.values()].find(
      (candidate) => candidate.secretDigest === account.secretDigest,
    );
    if (duplicateDigest) throw new Error('SERVICE_ACCOUNT_CONFLICT');
    this.accounts.set(account.id, clone(account));
  }

  public async replaceServiceAccount(
    context: IamTenantContextV1,
    account: ServiceAccountV1,
    expectedRevision: number,
  ): Promise<void> {
    await Promise.resolve();
    if (!writableInScope(context, account)) throw new Error('SCOPE_DENIED');
    const current = this.accounts.get(account.id);
    if (!current || !visibleInScope(context, current)) throw new Error('SERVICE_ACCOUNT_NOT_FOUND');
    if (!writableInScope(context, current)) throw new Error('SCOPE_DENIED');
    if (current.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
    if (account.revision !== expectedRevision + 1) throw new Error('INVALID_REVISION');
    const duplicateDigest = [...this.accounts.values()].find(
      (candidate) => candidate.id !== account.id && candidate.secretDigest === account.secretDigest,
    );
    if (duplicateDigest) throw new Error('SERVICE_ACCOUNT_CONFLICT');
    this.accounts.set(account.id, clone(account));
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ServiceAccountTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.accounts);
    try {
      return await work({
        findServiceAccount: this.findServiceAccount.bind(this),
        findServiceAccountByDigest: this.findServiceAccountByDigest.bind(this),
        listServiceAccounts: this.listServiceAccounts.bind(this),
        saveServiceAccount: this.saveServiceAccount.bind(this),
        replaceServiceAccount: this.replaceServiceAccount.bind(this),
      });
    } catch (error) {
      this.accounts = before;
      throw error;
    } finally {
      release();
    }
  }
}
