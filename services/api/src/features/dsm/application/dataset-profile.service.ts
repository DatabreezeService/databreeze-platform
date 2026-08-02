import {
  createDatasetProfileV1,
  type DatasetProfileResultV1,
  type DatasetProfileV1,
} from '@databreeze/domain/dataset-profile/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DatasetProfileRepositoryPortV1 } from './dataset-profile-repository.port.js';

export type DatasetProfileServiceErrorV1 = 'PROFILE_NOT_FOUND';
export type DatasetProfileServiceResultV1<TValue> =
  | DatasetProfileResultV1<TValue>
  | { readonly accepted: false; readonly code: DatasetProfileServiceErrorV1 };

/** Coordinates immutable, value-free profiling disclosure records. */
export class DatasetProfileService {
  public constructor(private readonly repository: DatasetProfileRepositoryPortV1) {}

  public async register(
    context: IamTenantContextV1,
    input: Parameters<typeof createDatasetProfileV1>[0],
  ): Promise<DatasetProfileServiceResultV1<DatasetProfileV1>> {
    const created = createDatasetProfileV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.profileId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value))
          return Object.freeze({ accepted: true, value: existing });
        throw new Error('DSM_IMMUTABLE_DATASET_PROFILE');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async find(
    context: IamTenantContextV1,
    profileId: DatasetProfileV1['profileId'],
  ): Promise<DatasetProfileServiceResultV1<DatasetProfileV1>> {
    const found = await this.repository.find(context, profileId);
    return found
      ? Object.freeze({ accepted: true, value: found })
      : Object.freeze({ accepted: false, code: 'PROFILE_NOT_FOUND' as const });
  }

  public async list(
    context: IamTenantContextV1,
    datasetVersionId: DatasetProfileV1['datasetVersionId'],
  ): Promise<readonly DatasetProfileV1[]> {
    return this.repository.withTransaction(context, (transaction) =>
      transaction.list(context, datasetVersionId),
    );
  }
}
