import {
  tenantScopeContainsV1,
  type DataModePolicyVersionV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';

import type {
  DataModePolicyRepositoryPortV1,
  DataModePolicyTransactionPortV1,
} from '../application/data-mode-policy-repository.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function scopeAllowsMutation(
  context: IamTenantContextV1,
  policy: DataModePolicyVersionV1,
): boolean {
  return (
    context.tenantScope.scopeType === 'workspace' &&
    policy.organizationId === context.tenantScope.organizationId &&
    policy.workspaceId === context.tenantScope.workspaceId
  );
}

function policyScope(policy: DataModePolicyVersionV1): TenantScopeV1 {
  return {
    scopeType: 'workspace',
    organizationId: policy.organizationId,
    workspaceId: policy.workspaceId,
  };
}

function clone(policy: DataModePolicyVersionV1): DataModePolicyVersionV1 {
  return Object.freeze({
    ...policy,
    allowedPayloadClasses: Object.freeze({
      PUBLIC: Object.freeze([...policy.allowedPayloadClasses.PUBLIC]),
      INTERNAL: Object.freeze([...policy.allowedPayloadClasses.INTERNAL]),
      CONFIDENTIAL: Object.freeze([...policy.allowedPayloadClasses.CONFIDENTIAL]),
      RESTRICTED: Object.freeze([...policy.allowedPayloadClasses.RESTRICTED]),
    }),
    allowedPlacementKinds: Object.freeze([...policy.allowedPlacementKinds]),
    allowedExecutorClasses: Object.freeze([...policy.allowedExecutorClasses]),
    allowedDestinationClasses: Object.freeze([...policy.allowedDestinationClasses]),
  });
}

/** In-memory DSO adapter with immutable versions and workspace visibility checks. */
export class InMemoryDataModePolicyRepositoryAdapter implements DataModePolicyRepositoryPortV1 {
  private policies = new Map<string, DataModePolicyVersionV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, policy: DataModePolicyVersionV1): Promise<void> {
    await Promise.resolve();
    if (!scopeAllowsMutation(context, policy)) throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = this.policies.get(policy.policyVersionId);
    if (existing && JSON.stringify(existing) === JSON.stringify(policy)) return;
    if (existing) throw new Error('DSO_IMMUTABLE_POLICY');
    this.policies.set(policy.policyVersionId, clone(policy));
  }

  public async find(
    context: IamTenantContextV1,
    policyVersionId: DataModePolicyVersionV1['policyVersionId'],
  ): Promise<DataModePolicyVersionV1 | undefined> {
    await Promise.resolve();
    const policy = this.policies.get(policyVersionId);
    return policy && visible(context.tenantScope, policyScope(policy)) ? clone(policy) : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    policyId: DataModePolicyVersionV1['policyId'],
  ): Promise<readonly DataModePolicyVersionV1[]> {
    await Promise.resolve();
    return [...this.policies.values()]
      .filter(
        (policy) =>
          policy.policyId === policyId && visible(context.tenantScope, policyScope(policy)),
      )
      .sort((left, right) => left.revision - right.revision)
      .map(clone);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DataModePolicyTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.policies);
    try {
      return await work({
        save: this.save.bind(this),
        find: this.find.bind(this),
        list: this.list.bind(this),
      });
    } catch (error) {
      this.policies = before;
      throw error;
    } finally {
      release();
    }
  }
}
