import {
  createDatasetDefinitionV1,
  publishDatasetDefinitionV1,
  type DatasetDefinitionV1,
  type DatasetResultV1,
} from '@databreeze/domain/dataset/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DatasetRepositoryPortV1 } from './dataset-repository.port.js';

/** Coordinates immutable DSM definition versions and explicit publication. */
export class DatasetDefinitionService {
  public constructor(private readonly repository: DatasetRepositoryPortV1) {}

  public async create(
    context: IamTenantContextV1,
    input: Parameters<typeof createDatasetDefinitionV1>[0],
  ): Promise<DatasetResultV1<DatasetDefinitionV1>> {
    const created = createDatasetDefinitionV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async publish(
    context: IamTenantContextV1,
    versionId: StableIdentifierV1,
    nextVersionIdInput: unknown,
    publishedAt: unknown,
  ): Promise<DatasetResultV1<DatasetDefinitionV1>> {
    const nextVersionId = parseStableIdentifierV1(nextVersionIdInput);
    if (!nextVersionId.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' });
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, versionId);
      if (!current) return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
      const published = publishDatasetDefinitionV1(
        { ...current, versionId: nextVersionId.value },
        publishedAt,
      );
      if (!published.accepted) return published;
      await transaction.save(context, published.value);
      return published;
    });
  }

  public async list(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly DatasetDefinitionV1[]> {
    return this.repository.list(context, datasetId);
  }
}
