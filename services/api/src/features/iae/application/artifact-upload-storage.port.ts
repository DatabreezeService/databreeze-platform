import type {
  ArtifactUploadPartV1,
  ArtifactUploadSessionV1,
} from '@databreeze/domain/artifact-upload/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const ARTIFACT_UPLOAD_STORAGE_PORT = Symbol('ARTIFACT_UPLOAD_STORAGE_PORT');

export interface ArtifactUploadPartTransferV1 {
  readonly transferId: string;
  readonly sessionId: ArtifactUploadSessionV1['sessionId'];
  readonly partNumber: number;
  readonly expiresAt: ArtifactUploadSessionV1['expiresAt'];
}

export type ArtifactUploadStorageErrorCodeV1 =
  | 'UPLOAD_STORAGE_SCOPE_DENIED'
  | 'UPLOAD_STORAGE_NOT_READY'
  | 'UPLOAD_STORAGE_TRANSFER_INVALID'
  | 'UPLOAD_STORAGE_PART_REJECTED'
  | 'UPLOAD_STORAGE_DIGEST_MISMATCH'
  | 'UPLOAD_STORAGE_FINALIZATION_FAILED';

export type ArtifactUploadStorageResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ArtifactUploadStorageErrorCodeV1 };

/**
 * Provider-neutral cloud object boundary. Implementations verify parts and
 * publish the object only after final digest validation; no partial locator or
 * raw bytes cross this port.
 */
export interface ArtifactUploadStoragePortV1 {
  issuePartTransfer(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    partNumber: number,
  ): Promise<ArtifactUploadStorageResultV1<ArtifactUploadPartTransferV1>>;
  verifyPart(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    part: ArtifactUploadPartV1,
    transferId?: string,
  ): Promise<ArtifactUploadStorageResultV1<void>>;
  finalize(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    assembledSha256: string,
  ): Promise<ArtifactUploadStorageResultV1<void>>;
  abort(context: IamTenantContextV1, session: ArtifactUploadSessionV1): Promise<void>;
}
