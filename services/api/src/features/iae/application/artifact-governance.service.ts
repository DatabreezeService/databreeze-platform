import {
  createArtifactLineageV1,
  evaluateArtifactRetentionV1,
  type ArtifactLineageV1,
  type ArtifactRetentionEvaluationV1,
  type ArtifactGovernanceResultV1,
} from '@databreeze/domain/artifact-governance/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactLineageRepositoryPortV1 } from './artifact-lineage-repository.port.js';

export type ArtifactGovernanceServiceErrorV1 = 'LINEAGE_NOT_FOUND';
export type ArtifactGovernanceServiceResultV1<TValue> =
  | ArtifactGovernanceResultV1<TValue>
  | { readonly accepted: false; readonly code: ArtifactGovernanceServiceErrorV1 };

/** Coordinates immutable lineage persistence while keeping retention a pure policy decision. */
export class ArtifactGovernanceService {
  public constructor(private readonly repository: ArtifactLineageRepositoryPortV1) {}

  public async registerLineage(
    context: IamTenantContextV1,
    input: Parameters<typeof createArtifactLineageV1>[0],
  ): Promise<ArtifactGovernanceServiceResultV1<ArtifactLineageV1>> {
    const created = createArtifactLineageV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.findByDerived(
        context,
        created.value.derivedArtifactVersionId,
      );
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value))
          return Object.freeze({ accepted: true as const, value: existing });
        throw new Error('IAE_DERIVED_LINEAGE_CONFLICT');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async findForDerived(
    context: IamTenantContextV1,
    derivedArtifactVersionId: ArtifactLineageV1['derivedArtifactVersionId'],
  ): Promise<ArtifactLineageV1 | undefined> {
    return this.repository.withTransaction(context, (transaction) =>
      transaction.findByDerived(context, derivedArtifactVersionId),
    );
  }

  public async listForSource(
    context: IamTenantContextV1,
    sourceArtifactVersionId: ArtifactLineageV1['sourceArtifactVersionIds'][number],
  ): Promise<readonly ArtifactLineageV1[]> {
    return this.repository.withTransaction(context, (transaction) =>
      transaction.listBySource(context, sourceArtifactVersionId),
    );
  }

  public evaluateRetention(
    input: Parameters<typeof evaluateArtifactRetentionV1>[0],
  ): ArtifactGovernanceResultV1<ArtifactRetentionEvaluationV1> {
    return evaluateArtifactRetentionV1(input);
  }
}
