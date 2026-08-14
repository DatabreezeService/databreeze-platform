import {
  tenantScopeContainsV1,
  tenantScopeKeyV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  AgentGrantRepositoryPortV1,
  AgentGrantTransactionPortV1,
  WorkspaceAgentGrantRecordV1,
  WorkspaceDatasetRestrictionRecordV1,
} from '../application/agent-grant-repository.port.js';
import type { IamTenantContextV1 } from '../application/tenant-context.js';

function cloneGrant(grant: WorkspaceAgentGrantRecordV1): WorkspaceAgentGrantRecordV1 {
  return Object.freeze({
    ...grant,
    tenantScope: Object.freeze({ ...grant.tenantScope }),
  });
}

function cloneRestrictions(
  record: WorkspaceDatasetRestrictionRecordV1,
): WorkspaceDatasetRestrictionRecordV1 {
  return Object.freeze({
    ...record,
    deniedDatasetIds: Object.freeze([...record.deniedDatasetIds]),
  });
}

function workspaceKey(context: IamTenantContextV1): string | undefined {
  if (context.tenantScope.scopeType !== 'workspace') return undefined;
  return tenantScopeKeyV1(context.tenantScope);
}

function memberKey(context: IamTenantContextV1, memberId: StableIdentifierV1): string | undefined {
  const scopeKey = workspaceKey(context);
  return scopeKey === undefined ? undefined : `${scopeKey}:${memberId}`;
}

/** Deterministic local adapter matching PostgreSQL scope and revision rules. */
export class InMemoryAgentGrantRepositoryAdapter implements AgentGrantRepositoryPortV1 {
  private grants = new Map<string, WorkspaceAgentGrantRecordV1>();
  private restrictions = new Map<string, WorkspaceDatasetRestrictionRecordV1>();
  private epochs = new Map<string, number>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async findGrant(
    context: IamTenantContextV1,
    memberId: StableIdentifierV1,
  ): Promise<WorkspaceAgentGrantRecordV1 | undefined> {
    await Promise.resolve();
    const key = memberKey(context, memberId);
    if (key === undefined) return undefined;
    const grant = this.grants.get(key);
    if (!grant) return undefined;
    if (!tenantScopeContainsV1(context.tenantScope, grant.tenantScope)) return undefined;
    return cloneGrant(grant);
  }

  public async saveGrant(
    context: IamTenantContextV1,
    grant: WorkspaceAgentGrantRecordV1,
    expectedRevision: number | undefined,
  ): Promise<void> {
    await Promise.resolve();
    if (context.tenantScope.scopeType !== 'workspace') throw new Error('IAM_SCOPE_DENIED');
    if (!tenantScopeContainsV1(context.tenantScope, grant.tenantScope)) {
      throw new Error('IAM_SCOPE_NARROWING_REQUIRED');
    }
    const key = memberKey(context, grant.memberId);
    if (key === undefined) throw new Error('IAM_SCOPE_DENIED');
    const existing = this.grants.get(key);
    if (existing) {
      if (expectedRevision !== existing.revision) throw new Error('IAM_REVISION_CONFLICT');
    } else if (expectedRevision !== undefined && expectedRevision !== 1) {
      throw new Error('IAM_REVISION_CONFLICT');
    }
    this.grants.set(key, cloneGrant(grant));
  }

  public async findDatasetRestrictions(
    context: IamTenantContextV1,
    memberId: StableIdentifierV1,
  ): Promise<WorkspaceDatasetRestrictionRecordV1 | undefined> {
    await Promise.resolve();
    const scopeKey = workspaceKey(context);
    if (scopeKey === undefined) return undefined;
    const epochKey: string = scopeKey;
    const key = `${epochKey}:${memberId}`;
    if (
      context.workspaceAuthorizationEpoch !== undefined &&
      (this.epochs.get(epochKey) ?? 1) !== context.workspaceAuthorizationEpoch
    ) {
      throw new Error('IAM_STALE_AUTHORIZATION');
    }
    const record = this.restrictions.get(key);
    return record ? cloneRestrictions(record) : undefined;
  }

  public async saveDatasetRestrictions(
    context: IamTenantContextV1,
    record: WorkspaceDatasetRestrictionRecordV1,
    expectedRevision: number | undefined,
  ): Promise<void> {
    await Promise.resolve();
    if (context.tenantScope.scopeType !== 'workspace') throw new Error('IAM_SCOPE_DENIED');
    const key = memberKey(context, record.memberId);
    if (key === undefined) throw new Error('IAM_SCOPE_DENIED');
    const existing = this.restrictions.get(key);
    if (existing) {
      if (expectedRevision !== existing.revision) throw new Error('IAM_REVISION_CONFLICT');
    } else if (expectedRevision !== undefined && expectedRevision !== 1) {
      throw new Error('IAM_REVISION_CONFLICT');
    }
    this.restrictions.set(key, cloneRestrictions(record));
  }

  public async bumpAuthorizationEpoch(context: IamTenantContextV1): Promise<number> {
    await Promise.resolve();
    const key = workspaceKey(context);
    if (key === undefined) throw new Error('IAM_SCOPE_DENIED');
    const next = (this.epochs.get(key) ?? 1) + 1;
    this.epochs.set(key, next);
    return next;
  }

  public async resolveWorkspaceAuthorizationEpoch(context: IamTenantContextV1): Promise<number> {
    await Promise.resolve();
    const key = workspaceKey(context);
    if (key === undefined) throw new Error('IAM_SCOPE_DENIED');
    return this.epochs.get(key) ?? 1;
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: AgentGrantTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const grantSnapshot = new Map(this.grants);
    const restrictionSnapshot = new Map(this.restrictions);
    const epochSnapshot = new Map(this.epochs);
    try {
      return await work({
        findGrant: this.findGrant.bind(this),
        saveGrant: this.saveGrant.bind(this),
        findDatasetRestrictions: this.findDatasetRestrictions.bind(this),
        saveDatasetRestrictions: this.saveDatasetRestrictions.bind(this),
        bumpAuthorizationEpoch: this.bumpAuthorizationEpoch.bind(this),
      });
    } catch (error) {
      this.grants = grantSnapshot;
      this.restrictions = restrictionSnapshot;
      this.epochs = epochSnapshot;
      throw error;
    } finally {
      release();
    }
  }
}
