import type { DatasetExportManifestV1 } from '@databreeze/domain/dataset-export/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DATASET_EXPORT_REPOSITORY_PORT = Symbol('DATASET_EXPORT_REPOSITORY_PORT');

export interface DatasetExportTransactionPortV1 {
  save(context: IamTenantContextV1, manifest: DatasetExportManifestV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    manifestId: DatasetExportManifestV1['manifestId'],
  ): Promise<DatasetExportManifestV1 | undefined>;
}

export interface DatasetExportRepositoryPortV1 extends DatasetExportTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetExportTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
