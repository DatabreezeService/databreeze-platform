import type { ArtifactLineageV1 } from '@databreeze/domain/artifact-governance/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const ARTIFACT_LINEAGE_REPOSITORY_PORT = Symbol('ARTIFACT_LINEAGE_REPOSITORY_PORT');

export interface ArtifactLineageTransactionPortV1 {
  save(
    context: IamTenantContextV1,
    lineage: ArtifactLineageV1,
  ): Promise<void>;
  findByDerived(
    context: IamTenantContextV1,
    derivedArtifactVersionId: ArtifactLineageV1['derivedArtifactVersionId'],
  ): Promise<ArtifactLineageV1 | undefined>;
  listBySource(
    context: IamTenantContextV1,
    sourceArtifactVersionId: ArtifactLineageV1['sourceArtifactVersionIds'][number],
  ): Promise<readonly ArtifactLineageV1[]>;
}

export interface ArtifactLineageRepositoryPortV1 extends ArtifactLineageTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactLineageTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
