import {
  tenantScopeContainsV1,
  tenantScopeKeyV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { ServiceAccountV1 } from '@databreeze/domain/service-account/v1';
import { parseStrictUtcTimestampV1 } from '@databreeze/domain/tenant-scope/v1';
import type { IamTenantContextV1 } from '../application/tenant-context.js';
import type {
  ServiceAccountCreateIdempotencyV1,
  ServiceAccountCreateReplayV1,
  ServiceAccountRepositoryPortV1,
  ServiceAccountTransactionPortV1,
} from '../application/service-account-repository.port.js';
import type { WorkerCredentialLookupPortV1 } from '../application/worker-credential-lookup.port.js';

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

function cloneReplay(replay: ServiceAccountCreateReplayV1): ServiceAccountCreateReplayV1 {
  return Object.freeze({
    ...replay,
    account: clone(replay.account),
  });
}

function createKey(record: ServiceAccountCreateReplayV1): string {
  return `${record.actorId}:${tenantScopeKeyV1(accountScope(record.account))}:${record.idempotencyKey}`;
}

function sameCreateRecord(
  left: ServiceAccountCreateReplayV1,
  right: ServiceAccountCreateReplayV1,
): boolean {
  return (
    left.requestHash === right.requestHash &&
    left.actorId === right.actorId &&
    left.idempotencyKey === right.idempotencyKey &&
    left.secretEnvelope === right.secretEnvelope &&
    left.expiresAt === right.expiresAt &&
    JSON.stringify(left.account) === JSON.stringify(right.account)
  );
}

/** Deterministic local adapter with the same visibility and optimistic-write rules as PostgreSQL. */
export class InMemoryServiceAccountRepositoryAdapter
  implements ServiceAccountRepositoryPortV1, WorkerCredentialLookupPortV1
{
  private accounts = new Map<string, ServiceAccountV1>();
  private createRecords = new Map<string, ServiceAccountCreateReplayV1>();
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

  public async findCurrentWorkerCredentialByDigest(
    secretDigest: string,
  ): Promise<ServiceAccountV1 | undefined> {
    await Promise.resolve();
    const account = [...this.accounts.values()].find(
      (candidate) => candidate.secretDigest === secretDigest,
    );
    return account ? clone(account) : undefined;
  }

  public async findCurrentWorkerCredentialById(
    workerId: ServiceAccountV1['id'],
  ): Promise<ServiceAccountV1 | undefined> {
    await Promise.resolve();
    const account = this.accounts.get(workerId);
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

  public async findServiceAccountByIdempotency(
    context: IamTenantContextV1,
    targetScope: TenantScopeV1,
    idempotencyKey: string,
  ): Promise<ServiceAccountCreateReplayV1 | undefined> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, targetScope)) return undefined;
    const record = [...this.createRecords.values()].find(
      (candidate) =>
        candidate.actorId === context.actorId &&
        candidate.idempotencyKey === idempotencyKey &&
        tenantScopeKeyV1(accountScope(candidate.account)) === tenantScopeKeyV1(targetScope) &&
        visibleInScope(context, candidate.account),
    );
    return record ? cloneReplay(record) : undefined;
  }

  public async saveServiceAccount(
    context: IamTenantContextV1,
    account: ServiceAccountV1,
    createIdempotency?: ServiceAccountCreateIdempotencyV1,
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
    if (createIdempotency) {
      if (
        createIdempotency.actorId !== context.actorId ||
        createIdempotency.idempotencyKey.length === 0 ||
        createIdempotency.idempotencyKey.length > 200 ||
        !/^[a-f0-9]{64}$/u.test(createIdempotency.requestHash) ||
        createIdempotency.secretEnvelope.length === 0 ||
        createIdempotency.secretEnvelope.length > 16_384 ||
        /\p{Cc}/u.test(createIdempotency.secretEnvelope) ||
        !parseStrictUtcTimestampV1(createIdempotency.expiresAt).accepted ||
        JSON.stringify(createIdempotency.accountSnapshot) !== JSON.stringify(account)
      )
        throw new Error('IAM_SERVICE_ACCOUNT_IDEMPOTENCY_INVALID');
      const replay = Object.freeze({
        account: clone(account),
        actorId: createIdempotency.actorId,
        idempotencyKey: createIdempotency.idempotencyKey,
        requestHash: createIdempotency.requestHash,
        secretEnvelope: createIdempotency.secretEnvelope,
        expiresAt: createIdempotency.expiresAt,
      });
      const existingReplay = this.createRecords.get(createKey(replay));
      if (existingReplay && !sameCreateRecord(existingReplay, replay))
        throw new Error('IDEMPOTENCY_KEY_REUSED');
      this.createRecords.set(createKey(replay), replay);
    }
    this.accounts.set(account.id, clone(account));
  }

  public async replaceServiceAccount(
    context: IamTenantContextV1,
    account: ServiceAccountV1,
    expectedRevision: number,
    clearCreateReplay = false,
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
    if (clearCreateReplay) {
      for (const [key, replay] of this.createRecords) {
        if (replay.account.id !== account.id) continue;
        this.createRecords.set(
          key,
          Object.freeze({ ...replay, secretEnvelope: '', expiresAt: replay.expiresAt }),
        );
      }
    }
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
    const beforeCreateRecords = new Map(this.createRecords);
    try {
      return await work({
        findServiceAccount: this.findServiceAccount.bind(this),
        findServiceAccountByDigest: this.findServiceAccountByDigest.bind(this),
        listServiceAccounts: this.listServiceAccounts.bind(this),
        findServiceAccountByIdempotency: this.findServiceAccountByIdempotency.bind(this),
        saveServiceAccount: this.saveServiceAccount.bind(this),
        replaceServiceAccount: this.replaceServiceAccount.bind(this),
      });
    } catch (error) {
      this.accounts = before;
      this.createRecords = beforeCreateRecords;
      throw error;
    } finally {
      release();
    }
  }
}
