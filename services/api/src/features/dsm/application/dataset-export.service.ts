import {
  createDatasetExportManifestV1,
  type DatasetExportManifestV1,
  type DatasetExportResultV1,
} from '@databreeze/domain/dataset-export/v1';
import { parseStableIdentifierV1, tenantScopeContainsV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DatasetVersionRepositoryPortV1 } from './dataset-version-repository.port.js';
import type { DatasetExportRepositoryPortV1 } from './dataset-export-repository.port.js';

export type DatasetExportServiceErrorV1 =
  | 'DATASET_VERSION_NOT_FOUND'
  | 'DATASET_VERSION_MISMATCH'
  | 'EXPORT_NOT_FOUND'
  | 'EXPORT_SCOPE_NARROWING_REQUIRED';
export type DatasetExportServiceResultV1<TValue> =
  | DatasetExportResultV1<TValue>
  | { readonly accepted: false; readonly code: DatasetExportServiceErrorV1 };

/** Binds a governed export manifest to an existing immutable dataset version. */
export class DatasetExportService {
  public constructor(
    private readonly manifests: DatasetExportRepositoryPortV1,
    private readonly versions: DatasetVersionRepositoryPortV1,
  ) {}

  public async create(
    context: IamTenantContextV1,
    input: Omit<Parameters<typeof createDatasetExportManifestV1>[0], 'tenantScope'> & {
      readonly tenantScope?: unknown;
    },
  ): Promise<DatasetExportServiceResultV1<DatasetExportManifestV1>> {
    const created = createDatasetExportManifestV1({
      ...input,
      tenantScope: input.tenantScope ?? context.tenantScope,
    });
    if (!created.accepted) return created;
    if (!tenantScopeContainsV1(context.tenantScope, created.value.tenantScope))
      return Object.freeze({ accepted: false, code: 'EXPORT_SCOPE_NARROWING_REQUIRED' as const });
    const version = await this.versions.find(context, created.value.datasetVersionId);
    if (!version)
      return Object.freeze({ accepted: false, code: 'DATASET_VERSION_NOT_FOUND' as const });
    if (version.datasetId !== created.value.datasetId)
      return Object.freeze({ accepted: false, code: 'DATASET_VERSION_MISMATCH' as const });
    return this.manifests.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.manifestId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value))
          return { accepted: true, value: existing };
        throw new Error('DSM_IMMUTABLE_EXPORT_MANIFEST');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async find(
    context: IamTenantContextV1,
    manifestIdInput: unknown,
  ): Promise<DatasetExportServiceResultV1<DatasetExportManifestV1>> {
    const manifestId = parseStableIdentifierV1(manifestIdInput);
    if (!manifestId.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
    const found = await this.manifests.find(context, manifestId.value);
    return found
      ? Object.freeze({ accepted: true, value: found })
      : Object.freeze({ accepted: false, code: 'EXPORT_NOT_FOUND' as const });
  }
}
