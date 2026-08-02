import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import {
  updateContentPlacementAvailabilityV1,
  type ArtifactResultV1,
  type ContentPlacementV1,
} from '@databreeze/domain/artifact/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactRepositoryPortV1 } from './artifact-repository.port.js';

export type ContentPlacementServiceErrorV1 = 'VERSION_NOT_FOUND' | 'PLACEMENT_NOT_FOUND';
export type ContentPlacementServiceResultV1<TValue> =
  | ArtifactResultV1<TValue>
  | { readonly accepted: false; readonly code: ContentPlacementServiceErrorV1 };

/** Updates only verified availability state while preserving opaque placement identity. */
export class ContentPlacementService {
  public constructor(private readonly repository: ArtifactRepositoryPortV1) {}

  public async setAvailability(
    context: IamTenantContextV1,
    input: {
      readonly versionId: unknown;
      readonly placementId: unknown;
      readonly available: unknown;
      readonly expectedRevision: unknown;
    },
  ): Promise<ContentPlacementServiceResultV1<ContentPlacementV1>> {
    const versionId = parseStableIdentifierV1(input.versionId);
    const placementId = parseStableIdentifierV1(input.placementId);
    if (!versionId.accepted || !placementId.accepted)
      return Object.freeze({ accepted: false as const, code: 'INVALID_IDENTIFIER' as const });
    return this.repository.withTransaction(context, async (transaction) => {
      const version = await transaction.findVersion(context, versionId.value);
      if (!version)
        return Object.freeze({ accepted: false as const, code: 'VERSION_NOT_FOUND' as const });
      const current = (await transaction.listPlacements(context, version.versionId)).find(
        (candidate) => candidate.placementId === placementId.value,
      );
      if (!current)
        return Object.freeze({ accepted: false as const, code: 'PLACEMENT_NOT_FOUND' as const });
      const updated = updateContentPlacementAvailabilityV1(
        current,
        input.available,
        input.expectedRevision,
      );
      if (!updated.accepted) return updated;
      await transaction.updatePlacement(context, updated.value);
      return updated;
    });
  }
}
