import type {
  ArtifactVersionV1,
  ContentPlacementV1,
  EvidenceReferenceV1,
} from '@databreeze/domain/artifact/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const ARTIFACT_REPOSITORY_PORT = Symbol('ARTIFACT_REPOSITORY_PORT');

export interface ArtifactTransactionPortV1 {
  saveVersion(context: IamTenantContextV1, version: ArtifactVersionV1): Promise<void>;
  findVersion(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<ArtifactVersionV1 | undefined>;
  savePlacement(context: IamTenantContextV1, placement: ContentPlacementV1): Promise<void>;
  listPlacements(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<readonly ContentPlacementV1[]>;
  saveEvidence(context: IamTenantContextV1, evidence: EvidenceReferenceV1): Promise<void>;
  listEvidence(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<readonly EvidenceReferenceV1[]>;
}

export interface ArtifactRepositoryPortV1 extends ArtifactTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
