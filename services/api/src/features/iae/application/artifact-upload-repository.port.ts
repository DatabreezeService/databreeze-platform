import type { ArtifactUploadSessionV1 } from '@databreeze/domain/artifact-upload/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const ARTIFACT_UPLOAD_REPOSITORY_PORT = Symbol('ARTIFACT_UPLOAD_REPOSITORY_PORT');

export interface ArtifactUploadTransactionPortV1 {
  save(context: IamTenantContextV1, session: ArtifactUploadSessionV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
  ): Promise<ArtifactUploadSessionV1 | undefined>;
}

export interface ArtifactUploadRepositoryPortV1 extends ArtifactUploadTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactUploadTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
