import { isDataModePayloadAllowedV1 } from '@databreeze/domain/data-mode/v1';
import { parseStableIdentifierV1, tenantScopesEqualV1 } from '@databreeze/domain/tenant-scope/v1';

import type { ArtifactRepositoryPortV1 } from '../features/iae/application/artifact-repository.port.js';
import type { ArtifactIntakeRepositoryPortV1 } from '../features/iae/application/artifact-intake-repository.port.js';
import type {
  ArtifactUploadAdmissionDecisionV1,
  ArtifactUploadAdmissionPortV1,
  ArtifactUploadAdmissionResultV1,
  ArtifactUploadDeclarationV1,
} from '../features/iae/application/artifact-upload-admission.port.js';
import {
  ARTIFACT_UPLOAD_MAX_OBJECT_BYTES_V1,
  ARTIFACT_UPLOAD_MAX_PART_BYTES_V1,
  ARTIFACT_UPLOAD_MIN_PART_BYTES_V1,
} from '../features/iae/application/artifact-upload-admission.port.js';
import type { IaeAuthorizationPortV1 } from '../features/iae/application/iae-authorization.port.js';
import type { IamTenantContextV1 } from '../features/iam/application/tenant-context.js';
import type { ExecutionRouteWorkspacePolicyAuthorityPortV1 } from '../features/dso/application/execution-route-policy-authority.port.js';

const DEFAULT_ALLOWED_MEDIA_TYPES = new Set([
  'application/octet-stream',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export interface RootArtifactUploadAdmissionOptionsV1 {
  readonly authorization: IaeAuthorizationPortV1;
  readonly intakes: Pick<ArtifactIntakeRepositoryPortV1, 'find'>;
  readonly artifacts: Pick<ArtifactRepositoryPortV1, 'findVersion'>;
  readonly policies: ExecutionRouteWorkspacePolicyAuthorityPortV1;
  readonly maxWorkspaceUploadBytes: number;
  readonly allowedMediaTypes?: ReadonlySet<string>;
}

function rejected<TValue>(
  code: Exclude<ArtifactUploadAdmissionResultV1<TValue>, { readonly accepted: true }>['code'],
): ArtifactUploadAdmissionResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** IAE-022 root seam: combines public authorities without cross-feature persistence reads. */
export class RootArtifactUploadAdmissionAdapter implements ArtifactUploadAdmissionPortV1 {
  private readonly allowedMediaTypes: ReadonlySet<string>;

  public constructor(private readonly options: RootArtifactUploadAdmissionOptionsV1) {
    this.allowedMediaTypes = options.allowedMediaTypes ?? DEFAULT_ALLOWED_MEDIA_TYPES;
  }

  public async admitCreate(
    context: IamTenantContextV1,
    declaration: ArtifactUploadDeclarationV1,
  ): Promise<ArtifactUploadAdmissionResultV1<ArtifactUploadAdmissionDecisionV1>> {
    if (context.tenantScope.scopeType !== 'workspace') return rejected('UPLOAD_SCOPE_DENIED');
    const intakeId = parseStableIdentifierV1(declaration.intakeId);
    if (!intakeId.accepted) return rejected('UPLOAD_INTAKE_NOT_FOUND');
    if (
      typeof declaration.expectedSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(declaration.expectedSha256) ||
      typeof declaration.expectedByteSize !== 'number' ||
      !Number.isSafeInteger(declaration.expectedByteSize) ||
      declaration.expectedByteSize < 1 ||
      declaration.expectedByteSize > ARTIFACT_UPLOAD_MAX_OBJECT_BYTES_V1 ||
      declaration.expectedByteSize > this.options.maxWorkspaceUploadBytes ||
      typeof declaration.requestedPartSize !== 'number' ||
      !Number.isSafeInteger(declaration.requestedPartSize) ||
      declaration.requestedPartSize < ARTIFACT_UPLOAD_MIN_PART_BYTES_V1 ||
      declaration.requestedPartSize > ARTIFACT_UPLOAD_MAX_PART_BYTES_V1
    )
      return rejected('UPLOAD_SIZE_POLICY_DENIED');
    if (
      typeof declaration.mediaType !== 'string' ||
      !this.allowedMediaTypes.has(declaration.mediaType.toLowerCase())
    )
      return rejected('UPLOAD_MEDIA_POLICY_DENIED');

    const authorization = await this.options.authorization.authorize(context, {
      tenantScope: context.tenantScope,
      action: 'ARTIFACT_UPLOAD_CREATE',
    });
    if (!authorization.accepted) return rejected('UPLOAD_PERMISSION_DENIED');
    const intake = await this.options.intakes.find(context, intakeId.value);
    if (!intake || !tenantScopesEqualV1(intake.tenantScope, context.tenantScope))
      return rejected('UPLOAD_INTAKE_NOT_FOUND');
    const artifact = await this.options.artifacts.findVersion(context, intake.artifactVersionId);
    if (!artifact || !tenantScopesEqualV1(artifact.tenantScope, context.tenantScope))
      return rejected('UPLOAD_ARTIFACT_MISMATCH');
    if (
      artifact.contentSha256 !== declaration.expectedSha256 ||
      artifact.byteSize !== declaration.expectedByteSize ||
      artifact.mediaType !== declaration.mediaType.toLowerCase() ||
      artifact.status !== 'QUARANTINED' ||
      artifact.scanState !== 'PENDING'
    )
      return rejected('UPLOAD_ARTIFACT_MISMATCH');
    if (artifact.dataMode === 'Local') return rejected('UPLOAD_DATA_MODE_DENIED');

    const current = await this.options.policies.resolveCurrentWorkspacePolicy({
      organizationId: context.tenantScope.organizationId,
      workspaceId: context.tenantScope.workspaceId,
    });
    if (
      !current ||
      current.authorizationEpoch !== context.authorizationEpoch ||
      current.policy.mode === 'LOCAL' ||
      !current.policy.allowedPlacementKinds.includes('CLOUD_OBJECT') ||
      !isDataModePayloadAllowedV1(current.policy, 'CONFIDENTIAL', 'ORIGINAL_CONTENT')
    )
      return rejected('UPLOAD_DATA_MODE_DENIED');

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        tenantScope: context.tenantScope,
        intakeId: intake.inboxItemId,
        artifactId: artifact.artifactId,
        artifactVersionId: artifact.versionId,
        policyVersionId: current.policy.policyVersionId,
        authorizationEpoch: current.authorizationEpoch,
        expectedSha256: artifact.contentSha256,
        expectedByteSize: artifact.byteSize,
        mediaType: artifact.mediaType,
        partSize: declaration.requestedPartSize,
      }),
    });
  }

  public async authorizeGrant(
    context: IamTenantContextV1,
    session: Parameters<ArtifactUploadAdmissionPortV1['authorizeGrant']>[1],
  ): Promise<ArtifactUploadAdmissionResultV1<true>> {
    const sessionWithAdmission = session as typeof session & {
      readonly intakeId?: unknown;
      readonly artifactVersionId?: unknown;
    };
    if (!sessionWithAdmission.intakeId || !sessionWithAdmission.artifactVersionId)
      return rejected('UPLOAD_ADMISSION_UNAVAILABLE');
    const result = await this.admitCreate(context, {
      intakeId: sessionWithAdmission.intakeId,
      expectedSha256: session.expectedSha256,
      expectedByteSize: session.expectedByteSize,
      mediaType: session.mediaType,
      requestedPartSize: session.partSize,
    });
    return result.accepted
      ? Object.freeze({ accepted: true, value: true as const })
      : Object.freeze({ accepted: false, code: result.code });
  }
}
