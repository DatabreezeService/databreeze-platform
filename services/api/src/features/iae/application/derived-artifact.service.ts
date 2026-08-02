import {
  createArtifactLineageV1,
  validateDerivedArtifactVersionV1,
  type ArtifactLineageV1,
  type ArtifactGovernanceResultV1,
} from '@databreeze/domain/artifact-governance/v1';
import {
  createArtifactVersionV1,
  createContentPlacementV1,
  createEvidenceReferenceV1,
  type ArtifactResultV1,
  type ArtifactVersionV1,
  type ContentPlacementV1,
  type EvidenceReferenceV1,
} from '@databreeze/domain/artifact/v1';
import { parseStableIdentifierV1, type StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactLineageRepositoryPortV1 } from './artifact-lineage-repository.port.js';
import type { ArtifactRepositoryPortV1 } from './artifact-repository.port.js';

export interface DerivedArtifactRegistrationInputV1 {
  readonly version: Parameters<typeof createArtifactVersionV1>[0];
  readonly placement: Omit<Parameters<typeof createContentPlacementV1>[0], 'artifactVersion'>;
  readonly evidence?: Omit<Parameters<typeof createEvidenceReferenceV1>[0], 'artifactVersion'>;
  readonly sourceArtifactVersionIds: readonly unknown[];
  readonly lineage: Omit<
    Parameters<typeof createArtifactLineageV1>[0],
    'sourceArtifactVersionIds' | 'sourceTenantScopes' | 'tenantScope' | 'derivedArtifactVersionId'
  >;
}

export interface DerivedArtifactRegistrationValueV1 {
  readonly version: ArtifactVersionV1;
  readonly placement: ContentPlacementV1;
  readonly evidence?: EvidenceReferenceV1;
  readonly lineage: ArtifactLineageV1;
}

export type DerivedArtifactServiceErrorV1 = 'SOURCE_NOT_FOUND';
export type DerivedArtifactServiceResultV1<TValue> =
  | ArtifactResultV1<TValue>
  | ArtifactGovernanceResultV1<TValue>
  | { readonly accepted: false; readonly code: DerivedArtifactServiceErrorV1 };

/** Registers a derivative only after reading and validating every exact source version. */
export class DerivedArtifactService {
  public constructor(
    private readonly artifactRepository: ArtifactRepositoryPortV1,
    private readonly lineageRepository: ArtifactLineageRepositoryPortV1,
  ) {}

  public async register(
    context: IamTenantContextV1,
    input: DerivedArtifactRegistrationInputV1,
  ): Promise<DerivedArtifactServiceResultV1<DerivedArtifactRegistrationValueV1>> {
    const version = createArtifactVersionV1(input.version);
    if (!version.accepted) return version;
    const sourceIds: StableIdentifierV1[] = [];
    for (const candidate of input.sourceArtifactVersionIds) {
      const parsed = parseStableIdentifierV1(candidate);
      if (!parsed.accepted) return Object.freeze({ accepted: false as const, code: 'INVALID_IDENTIFIER' as const });
      sourceIds.push(parsed.value);
    }
    const sourceVersions = await this.artifactRepository.withTransaction(context, async (transaction) => {
      const values: ArtifactVersionV1[] = [];
      for (const sourceId of sourceIds) {
        const source = await transaction.findVersion(context, sourceId);
        if (!source) return undefined;
        values.push(source);
      }
      return values;
    });
    if (!sourceVersions) return Object.freeze({ accepted: false as const, code: 'SOURCE_NOT_FOUND' as const });
    const policy = validateDerivedArtifactVersionV1({ derived: version.value, sourceVersions });
    if (!policy.accepted) return policy;
    const placement = createContentPlacementV1({ ...input.placement, artifactVersion: version.value });
    if (!placement.accepted) return placement;
    const evidence = input.evidence
      ? createEvidenceReferenceV1({ ...input.evidence, artifactVersion: version.value })
      : undefined;
    if (evidence && !evidence.accepted) return evidence;
    const lineage = createArtifactLineageV1({
      ...input.lineage,
      tenantScope: version.value.tenantScope,
      derivedArtifactVersionId: version.value.versionId,
      sourceArtifactVersionIds: sourceIds,
      sourceTenantScopes: sourceVersions.map((source) => source.tenantScope),
    });
    if (!lineage.accepted) return lineage;
    return this.artifactRepository.withTransaction(context, async (artifactTransaction) =>
      this.lineageRepository.withTransaction(context, async (lineageTransaction) => {
        await artifactTransaction.saveVersion(context, version.value);
        await artifactTransaction.savePlacement(context, placement.value);
        if (evidence?.accepted) await artifactTransaction.saveEvidence(context, evidence.value);
        await lineageTransaction.save(context, lineage.value);
        return Object.freeze({
          accepted: true as const,
          value: Object.freeze({
            version: version.value,
            placement: placement.value,
            ...(evidence?.accepted ? { evidence: evidence.value } : {}),
            lineage: lineage.value,
          }),
        });
      }),
    );
  }
}
