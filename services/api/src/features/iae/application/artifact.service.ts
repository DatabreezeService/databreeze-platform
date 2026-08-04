import {
  createArtifactVersionV1,
  createContentPlacementV1,
  createEvidenceReferenceV1,
  type ArtifactResultV1,
  type ArtifactVersionV1,
  type ContentPlacementV1,
  type EvidenceReferenceV1,
} from '@databreeze/domain/artifact/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactRepositoryPortV1 } from './artifact-repository.port.js';

export interface ArtifactRegistrationInputV1 {
  readonly version: Parameters<typeof createArtifactVersionV1>[0];
  readonly placement: Omit<Parameters<typeof createContentPlacementV1>[0], 'artifactVersion'>;
  readonly evidence?: Omit<Parameters<typeof createEvidenceReferenceV1>[0], 'artifactVersion'>;
}

export interface ArtifactRegistrationValueV1 {
  readonly version: ArtifactVersionV1;
  readonly placement: ContentPlacementV1;
  readonly evidence?: EvidenceReferenceV1;
}

export type EvidenceResolutionActionV1 = 'OPEN_ON_SOURCE_DEVICE' | 'OPEN_CLOUD' | 'UNAVAILABLE';

export interface EvidenceResolutionV1 {
  readonly evidence: EvidenceReferenceV1;
  readonly version: ArtifactVersionV1;
  readonly action: EvidenceResolutionActionV1;
  /** Opaque placement handle only; never a local path, URL, or source value. */
  readonly placementReference?: string;
}

/** Registers immutable versions, opaque placements, and exact evidence in one transaction. */
export class ArtifactService {
  public constructor(private readonly repository: ArtifactRepositoryPortV1) {}

  public async register(
    context: IamTenantContextV1,
    input: ArtifactRegistrationInputV1,
  ): Promise<ArtifactResultV1<ArtifactRegistrationValueV1>> {
    const version = createArtifactVersionV1(input.version);
    if (!version.accepted) return version;
    const placement = createContentPlacementV1({
      ...input.placement,
      artifactVersion: version.value,
    });
    if (!placement.accepted) return placement;
    const evidence = input.evidence
      ? createEvidenceReferenceV1({ ...input.evidence, artifactVersion: version.value })
      : undefined;
    if (evidence && !evidence.accepted) return evidence;
    return this.repository.withTransaction(context, async (transaction) => {
      await transaction.saveVersion(context, version.value);
      await transaction.savePlacement(context, placement.value);
      if (evidence?.accepted) await transaction.saveEvidence(context, evidence.value);
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          version: version.value,
          placement: placement.value,
          ...(evidence?.accepted ? { evidence: evidence.value } : {}),
        }),
      });
    });
  }

  public async find(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<{
    readonly version: ArtifactVersionV1 | undefined;
    readonly placements: readonly ContentPlacementV1[];
    readonly evidence: readonly EvidenceReferenceV1[];
  }> {
    return this.repository.withTransaction(context, async (transaction) => ({
      version: await transaction.findVersion(context, versionId),
      placements: await transaction.listPlacements(context, versionId),
      evidence: await transaction.listEvidence(context, versionId),
    }));
  }

  /** Resolves exact-version evidence without relaying local source content. */
  public async resolveEvidence(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
    evidenceId: EvidenceReferenceV1['evidenceId'],
  ): Promise<EvidenceResolutionV1 | undefined> {
    return this.repository.withTransaction(context, async (transaction) => {
      const candidates = await transaction.listEvidence(context, versionId);
      const evidence = candidates.find((item) => item.evidenceId === evidenceId);
      if (!evidence) return undefined;
      const version = await transaction.findVersion(context, versionId);
      if (!version) return undefined;
      if (
        version.status === 'DELETED' ||
        version.status === 'QUARANTINED' ||
        version.scanState !== 'CLEAN' ||
        evidence.sourceState !== 'AVAILABLE'
      )
        return Object.freeze({ evidence, version, action: 'UNAVAILABLE' as const });
      const placements = await transaction.listPlacements(context, version.versionId);
      const cloud = placements.find(
        (placement) => placement.kind === 'CLOUD' && placement.available,
      );
      if (cloud)
        return Object.freeze({
          evidence,
          version,
          action: 'OPEN_CLOUD' as const,
          placementReference: cloud.opaqueReference,
        });
      const local = placements.find((placement) => placement.kind === 'LOCAL');
      if (local)
        return local.available
          ? Object.freeze({
              evidence,
              version,
              action: 'OPEN_ON_SOURCE_DEVICE' as const,
              placementReference: local.opaqueReference,
            })
          : Object.freeze({ evidence, version, action: 'UNAVAILABLE' as const });
      return Object.freeze({ evidence, version, action: 'UNAVAILABLE' as const });
    });
  }
}
