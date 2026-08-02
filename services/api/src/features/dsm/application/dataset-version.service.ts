import {
  createDatasetVersionManifestV1,
  type DatasetVersionManifestV1,
  type DatasetGovernanceResultV1,
} from '@databreeze/domain/dataset-governance/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DatasetVersionRepositoryPortV1 } from './dataset-version-repository.port.js';

export type DatasetVersionServiceErrorV1 = 'VERSION_NOT_FOUND';
export type DatasetVersionServiceResultV1<TValue> =
  | DatasetGovernanceResultV1<TValue>
  | { readonly accepted: false; readonly code: DatasetVersionServiceErrorV1 };

export class DatasetVersionService {
  public constructor(private readonly repository: DatasetVersionRepositoryPortV1) {}

  public async register(
    context: IamTenantContextV1,
    input: Parameters<typeof createDatasetVersionManifestV1>[0],
  ): Promise<DatasetVersionServiceResultV1<DatasetVersionManifestV1>> {
    const created = createDatasetVersionManifestV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.versionId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value))
          return { accepted: true, value: existing };
        throw new Error('DSM_IMMUTABLE_DATASET_VERSION');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async find(
    context: IamTenantContextV1,
    versionId: DatasetVersionManifestV1['versionId'],
  ): Promise<DatasetVersionServiceResultV1<DatasetVersionManifestV1>> {
    const found = await this.repository.find(context, versionId);
    return found
      ? Object.freeze({ accepted: true, value: found })
      : Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });
  }
}
