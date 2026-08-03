import {
  finalizeArtifactAdmissionV1,
  type ArtifactIntakeResultV1,
  type ArtifactScanStateV1,
} from '@databreeze/domain/artifact-intake/v1';
import type { ArtifactVersionV1 } from '@databreeze/domain/artifact/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactRepositoryPortV1 } from './artifact-repository.port.js';

export type ArtifactAdmissionServiceErrorV1 = 'ARTIFACT_NOT_FOUND' | 'ADMISSION_UPDATE_FAILED';
export type ArtifactAdmissionServiceResultV1<TValue> =
  | ArtifactIntakeResultV1<TValue>
  | { readonly accepted: false; readonly code: ArtifactAdmissionServiceErrorV1 };

/** IAE-009/010: validates scanner output, then records only the governed status projection. */
export class ArtifactAdmissionService {
  public constructor(private readonly repository: ArtifactRepositoryPortV1) {}

  public async admit(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
    input: Omit<Parameters<typeof finalizeArtifactAdmissionV1>[0], 'artifact'>,
  ): Promise<
    ArtifactAdmissionServiceResultV1<{
      readonly version: ArtifactVersionV1;
      readonly status: 'ACTIVE' | 'QUARANTINED';
      readonly scanState: ArtifactScanStateV1;
    }>
  > {
    return this.repository.withTransaction(context, async (transaction) => {
      const artifact = await transaction.findVersion(context, versionId);
      if (!artifact) return Object.freeze({ accepted: false, code: 'ARTIFACT_NOT_FOUND' as const });
      const admission = finalizeArtifactAdmissionV1({ ...input, artifact });
      if (!admission.accepted) return admission;
      const updated = await transaction.updateVersionStatus(
        context,
        versionId,
        admission.value.status,
        admission.value.scanState,
      );
      if (!updated)
        return Object.freeze({ accepted: false, code: 'ADMISSION_UPDATE_FAILED' as const });
      return Object.freeze({
        accepted: true,
        value: Object.freeze({ version: updated, ...admission.value }),
      });
    });
  }
}
