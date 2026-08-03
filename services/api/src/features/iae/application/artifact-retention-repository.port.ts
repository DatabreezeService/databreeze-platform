import type { ArtifactDeletionRequestV1 } from '@databreeze/domain/artifact-retention/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const ARTIFACT_RETENTION_REPOSITORY_PORT = Symbol('ARTIFACT_RETENTION_REPOSITORY_PORT');

export interface ArtifactRetentionTransactionPortV1 {
  save(context: IamTenantContextV1, request: ArtifactDeletionRequestV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    requestId: ArtifactDeletionRequestV1['requestId'],
  ): Promise<ArtifactDeletionRequestV1 | undefined>;
}

export interface ArtifactRetentionRepositoryPortV1 extends ArtifactRetentionTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactRetentionTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
