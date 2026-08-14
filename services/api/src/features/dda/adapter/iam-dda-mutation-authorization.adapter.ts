import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';

import type { DdaIaePortV1 } from '../application/foundation-ports.js';
import type { IamActionAuthorizationSourceV1 } from '../agent/adapter/iam-action-authorization.adapter.js';
import type { IamDdaMutationAuthorizationSourceV1 } from './iam-dda-mutation-authorization.source.js';

/**
 * Root-only bridge from the current IAM action evaluator to DDA's mutation seam.
 * Resource IDs are supplied by the server-side DDA adapter and the artifact action
 * additionally requires IAE ownership. Missing IAE authority is unavailable.
 */
export class IamDdaMutationAuthorizationSourceAdapter
  implements IamDdaMutationAuthorizationSourceV1
{
  public constructor(
    private readonly iam: IamActionAuthorizationSourceV1,
    private readonly iae?: DdaIaePortV1,
  ) {}

  public async authorize(input: Parameters<IamDdaMutationAuthorizationSourceV1['authorize']>[0]) {
    try {
      const action = await this.iam.authorize({
        context: input.context,
        action: input.action,
        resourceIds: input.resourceIds,
      });
      if (!action.allowed) return { allowed: false as const, code: 'FORBIDDEN' as const };

      if (input.action === PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE) {
        if (this.iae === undefined || input.resourceIds.length !== 1) {
          return { allowed: false as const, code: 'AUTHORIZATION_UNAVAILABLE' as const };
        }
        const artifactVersionId = input.resourceIds[0];
        if (artifactVersionId === undefined) {
          return { allowed: false as const, code: 'AUTHORIZATION_UNAVAILABLE' as const };
        }
        await this.iae.requireArtifactVersion({
          id: artifactVersionId,
          tenantScope: input.context.tenantScope,
        });
      }
      return { allowed: true as const };
    } catch {
      return { allowed: false as const, code: 'AUTHORIZATION_UNAVAILABLE' as const };
    }
  }
}
