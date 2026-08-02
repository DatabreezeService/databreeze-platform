import type { RuleSetDefinitionV1 } from '@databreeze/domain/rule-set/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const RULE_SET_REPOSITORY_PORT = Symbol('RULE_SET_REPOSITORY_PORT');

export interface RuleSetTransactionPortV1 {
  save(context: IamTenantContextV1, definition: RuleSetDefinitionV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    versionId: StableIdentifierV1,
  ): Promise<RuleSetDefinitionV1 | undefined>;
  list(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly RuleSetDefinitionV1[]>;
}

export interface RuleSetRepositoryPortV1 extends RuleSetTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: RuleSetTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
