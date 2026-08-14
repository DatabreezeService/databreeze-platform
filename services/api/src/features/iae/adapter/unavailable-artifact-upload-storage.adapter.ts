import type {
  ArtifactUploadPartV1,
  ArtifactUploadSessionV1,
} from '@databreeze/domain/artifact-upload/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactUploadPartTransferV1,
  ArtifactUploadStoragePortV1,
  ArtifactUploadStorageResultV1,
  ArtifactUploadVerifiedStorageV1,
} from '../application/artifact-upload-storage.port.js';

const unavailable = <TValue>(): ArtifactUploadStorageResultV1<TValue> => ({
  accepted: false,
  code: 'UPLOAD_STORAGE_NOT_READY',
});

/**
 * Fail-closed production fallback used by production-shaped module tests and
 * partial compositions. Real production startup supplies the validated S3
 * adapter and therefore never reaches this provider.
 */
export class UnavailableArtifactUploadStorageAdapter implements ArtifactUploadStoragePortV1 {
  public issuePartTransfer(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    input: {
      readonly partNumber: number;
      readonly contentSha256: string;
      readonly byteSize: number;
    },
  ): Promise<ArtifactUploadStorageResultV1<ArtifactUploadPartTransferV1>> {
    void context;
    void session;
    void input;
    return Promise.resolve(unavailable());
  }

  public verifyPart(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    part: ArtifactUploadPartV1,
    transferId?: string,
  ): Promise<ArtifactUploadStorageResultV1<void>> {
    void context;
    void session;
    void part;
    void transferId;
    return Promise.resolve(unavailable());
  }

  public finalize(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    assembledSha256: string,
  ): Promise<ArtifactUploadStorageResultV1<ArtifactUploadVerifiedStorageV1>> {
    void context;
    void session;
    void assembledSha256;
    return Promise.resolve(unavailable());
  }

  public abort(context: IamTenantContextV1, session: ArtifactUploadSessionV1): Promise<void> {
    void context;
    void session;
    return Promise.resolve();
  }
}
