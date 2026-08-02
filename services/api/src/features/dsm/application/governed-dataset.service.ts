import {
  compareGovernedSchemaCompatibilityV1,
  createGovernedDatasetDefinitionV1,
  publishGovernedDatasetDefinitionV1,
  type DatasetGovernanceResultV1,
  type GovernedDatasetDefinitionV1,
  type SchemaCompatibilityV1,
} from '@databreeze/domain/dataset-governance/v1';
import { parseStableIdentifierV1, type StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { GovernedDatasetRepositoryPortV1 } from './governed-dataset-repository.port.js';

export type GovernedDatasetServiceErrorV1 = 'VERSION_NOT_FOUND';
export type GovernedDatasetServiceResultV1<TValue> =
  | DatasetGovernanceResultV1<TValue>
  | { readonly accepted: false; readonly code: GovernedDatasetServiceErrorV1 };

export class GovernedDatasetService {
  public constructor(private readonly repository: GovernedDatasetRepositoryPortV1) {}

  public async create(
    context: IamTenantContextV1,
    input: Parameters<typeof createGovernedDatasetDefinitionV1>[0],
  ): Promise<GovernedDatasetServiceResultV1<GovernedDatasetDefinitionV1>> {
    const created = createGovernedDatasetDefinitionV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.versionId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value)) return created;
        throw new Error('DSM_IMMUTABLE_DEFINITION');
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
  ): Promise<GovernedDatasetServiceResultV1<GovernedDatasetDefinitionV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, versionId);
      if (!current) return Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });
      const published = publishGovernedDatasetDefinitionV1(current, nextVersionIdInput, publishedAt);
      if (!published.accepted) return published;
      await transaction.save(context, published.value);
      return published;
    });
  }

  public async compare(
    context: IamTenantContextV1,
    previousVersionId: StableIdentifierV1,
    nextVersionId: StableIdentifierV1,
  ): Promise<GovernedDatasetServiceResultV1<SchemaCompatibilityV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const previous = await transaction.find(context, previousVersionId);
      const next = await transaction.find(context, nextVersionId);
      if (!previous || !next) return Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });
      return compareGovernedSchemaCompatibilityV1(previous, next);
    });
  }

  public async list(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly GovernedDatasetDefinitionV1[]> {
    return this.repository.withTransaction(context, (transaction) => transaction.list(context, datasetId));
  }
}
