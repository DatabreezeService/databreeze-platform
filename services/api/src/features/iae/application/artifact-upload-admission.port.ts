import type { ArtifactUploadSessionV1 } from '@databreeze/domain/artifact-upload/v1';
import type { StableIdentifierV1, TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const ARTIFACT_UPLOAD_ADMISSION_PORT = Symbol('ARTIFACT_UPLOAD_ADMISSION_PORT');

export const ARTIFACT_UPLOAD_MIN_PART_BYTES_V1 = 8 * 1024 * 1024;
export const ARTIFACT_UPLOAD_MAX_PART_BYTES_V1 = 64 * 1024 * 1024;
export const ARTIFACT_UPLOAD_MAX_OBJECT_BYTES_V1 = 20 * 1024 * 1024 * 1024;

export type ArtifactUploadAdmissionErrorCodeV1 =
  | 'UPLOAD_PERMISSION_DENIED'
  | 'UPLOAD_SCOPE_DENIED'
  | 'UPLOAD_INTAKE_NOT_FOUND'
  | 'UPLOAD_ARTIFACT_MISMATCH'
  | 'UPLOAD_DATA_MODE_DENIED'
  | 'UPLOAD_SIZE_POLICY_DENIED'
  | 'UPLOAD_MEDIA_POLICY_DENIED'
  | 'UPLOAD_QUOTA_DENIED'
  | 'UPLOAD_ADMISSION_UNAVAILABLE';

export type ArtifactUploadAdmissionResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ArtifactUploadAdmissionErrorCodeV1 };

export interface ArtifactUploadDeclarationV1 {
  readonly intakeId: unknown;
  readonly expectedSha256: unknown;
  readonly expectedByteSize: unknown;
  readonly mediaType: unknown;
  readonly requestedPartSize: unknown;
}

export interface ArtifactUploadAdmissionDecisionV1 {
  readonly tenantScope: TenantScopeV1;
  readonly intakeId: StableIdentifierV1;
  readonly artifactId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly policyVersionId: StableIdentifierV1;
  readonly authorizationEpoch: number;
  readonly expectedSha256: string;
  readonly expectedByteSize: number;
  readonly mediaType: string;
  readonly partSize: number;
}

export interface ArtifactUploadAdmissionPortV1 {
  admitCreate(
    context: IamTenantContextV1,
    declaration: ArtifactUploadDeclarationV1,
  ): Promise<ArtifactUploadAdmissionResultV1<ArtifactUploadAdmissionDecisionV1>>;
  authorizeGrant(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
  ): Promise<ArtifactUploadAdmissionResultV1<true>>;
}

export class UnavailableArtifactUploadAdmissionAdapter implements ArtifactUploadAdmissionPortV1 {
  public admitCreate(
    context: IamTenantContextV1,
    declaration: ArtifactUploadDeclarationV1,
  ): Promise<ArtifactUploadAdmissionResultV1<ArtifactUploadAdmissionDecisionV1>> {
    void context;
    void declaration;
    return Promise.resolve({ accepted: false, code: 'UPLOAD_ADMISSION_UNAVAILABLE' });
  }

  public authorizeGrant(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
  ): Promise<ArtifactUploadAdmissionResultV1<true>> {
    void context;
    void session;
    return Promise.resolve({ accepted: false, code: 'UPLOAD_ADMISSION_UNAVAILABLE' });
  }
}
