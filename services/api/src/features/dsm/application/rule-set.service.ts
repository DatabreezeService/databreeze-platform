import {
  createRuleSetDefinitionV1,
  publishRuleSetDefinitionV1,
  type RuleSetDefinitionV1,
  type RuleSetResultV1,
} from '@databreeze/domain/rule-set/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { RuleSetRepositoryPortV1 } from './rule-set-repository.port.js';

export type RuleSetServiceErrorV1 = 'VERSION_NOT_FOUND';
export type RuleSetServiceResultV1<TValue> =
  | RuleSetResultV1<TValue>
  | { readonly accepted: false; readonly code: RuleSetServiceErrorV1 };

export class RuleSetService {
  public constructor(private readonly repository: RuleSetRepositoryPortV1) {}

  public async create(
    context: IamTenantContextV1,
    input: Parameters<typeof createRuleSetDefinitionV1>[0],
  ): Promise<RuleSetServiceResultV1<RuleSetDefinitionV1>> {
    const created = createRuleSetDefinitionV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.versionId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value)) return created;
        throw new Error('DSM_IMMUTABLE_RULE_SET');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async publish(
    context: IamTenantContextV1,
    versionId: StableIdentifierV1,
    nextVersionIdInput: unknown,
    publishedAt: unknown,
  ): Promise<RuleSetServiceResultV1<RuleSetDefinitionV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, versionId);
      if (!current)
        return Object.freeze({ accepted: false as const, code: 'VERSION_NOT_FOUND' as const });
      const published = publishRuleSetDefinitionV1(current, nextVersionIdInput, publishedAt);
      if (!published.accepted) return published;
      await transaction.save(context, published.value);
      return published;
    });
  }

  public async list(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly RuleSetDefinitionV1[]> {
    return this.repository.withTransaction(context, (transaction) =>
      transaction.list(context, datasetId),
    );
  }
}
