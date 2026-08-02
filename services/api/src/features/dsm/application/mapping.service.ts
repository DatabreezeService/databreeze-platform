import {
  createMappingDefinitionV1,
  publishMappingDefinitionV1,
  type MappingDefinitionV1,
  type MappingResultV1,
} from '@databreeze/domain/mapping/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { MappingRepositoryPortV1 } from './mapping-repository.port.js';

export type MappingServiceErrorV1 = 'VERSION_NOT_FOUND';
export type MappingServiceResultV1<TValue> =
  | MappingResultV1<TValue>
  | { readonly accepted: false; readonly code: MappingServiceErrorV1 };

export class MappingService {
  public constructor(private readonly repository: MappingRepositoryPortV1) {}

  public async create(
    context: IamTenantContextV1,
    input: Parameters<typeof createMappingDefinitionV1>[0],
  ): Promise<MappingServiceResultV1<MappingDefinitionV1>> {
    const created = createMappingDefinitionV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.versionId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value)) return created;
        throw new Error('DSM_IMMUTABLE_MAPPING');
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
  ): Promise<MappingServiceResultV1<MappingDefinitionV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, versionId);
      if (!current)
        return Object.freeze({ accepted: false as const, code: 'VERSION_NOT_FOUND' as const });
      const published = publishMappingDefinitionV1(current, nextVersionIdInput, publishedAt);
      if (!published.accepted) return published;
      await transaction.save(context, published.value);
      return published;
    });
  }

  public async list(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly MappingDefinitionV1[]> {
    return this.repository.withTransaction(context, (transaction) =>
      transaction.list(context, datasetId),
    );
  }
}
