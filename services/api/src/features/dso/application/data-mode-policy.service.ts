import {
  createDataModePolicyVersionV1,
  ensureDataModePolicyNarrowingV1,
  type DataModePolicyResultV1,
  type DataModePolicyVersionV1,
} from '@databreeze/domain/data-mode/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DataModePolicyRepositoryPortV1 } from './data-mode-policy-repository.port.js';

export const DATA_MODE_POLICY_SERVICE = Symbol('DATA_MODE_POLICY_SERVICE');

function rejected<TValue>(
  code: 'INVALID_IDENTIFIER' | 'POLICY_BROADENS_PARENT',
): DataModePolicyResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** Publishes DSO policy versions while allowing child policies only to narrow authority. */
export class DataModePolicyService {
  public constructor(private readonly repository: DataModePolicyRepositoryPortV1) {}

  public async publish(
    context: IamTenantContextV1,
    input: Parameters<typeof createDataModePolicyVersionV1>[0],
    parentVersionId?: DataModePolicyVersionV1['policyVersionId'],
  ): Promise<DataModePolicyResultV1<DataModePolicyVersionV1>> {
    const created = createDataModePolicyVersionV1(input);
    if (!created.accepted) return created;
    if (
      context.tenantScope.scopeType !== 'workspace' ||
      created.value.organizationId !== context.tenantScope.organizationId ||
      created.value.workspaceId !== context.tenantScope.workspaceId
    )
      return rejected('INVALID_IDENTIFIER');
    return this.repository.withTransaction(context, async (transaction) => {
      if (parentVersionId) {
        const parent = await transaction.find(context, parentVersionId);
        if (!parent) return rejected('INVALID_IDENTIFIER');
        const narrowed = ensureDataModePolicyNarrowingV1(parent, created.value);
        if (!narrowed.accepted) return narrowed;
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async find(
    context: IamTenantContextV1,
    policyVersionId: DataModePolicyVersionV1['policyVersionId'],
  ): Promise<DataModePolicyVersionV1 | undefined> {
    return this.repository.find(context, policyVersionId);
  }

  public async list(
    context: IamTenantContextV1,
    policyId: DataModePolicyVersionV1['policyId'],
  ): Promise<readonly DataModePolicyVersionV1[]> {
    return this.repository.list(context, policyId);
  }
}
