import type { ArtifactExportManifestV1 } from '@databreeze/domain/artifact-export/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const ARTIFACT_EXPORT_REPOSITORY_PORT = Symbol('ARTIFACT_EXPORT_REPOSITORY_PORT');

export interface ArtifactExportTransactionPortV1 {
  save(context: IamTenantContextV1, manifest: ArtifactExportManifestV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    manifestId: ArtifactExportManifestV1['manifestId'],
  ): Promise<ArtifactExportManifestV1 | undefined>;
}

export interface ArtifactExportRepositoryPortV1 extends ArtifactExportTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactExportTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
