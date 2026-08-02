import {
  tenantScopeContainsV1,
  type ArtifactScanStateV1,
  type ArtifactVersionV1,
  type ContentPlacementV1,
  type EvidenceReferenceV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';

import type {
  ArtifactRepositoryPortV1,
  ArtifactTransactionPortV1,
} from '../application/artifact-repository.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

function visibleInScope(context: TenantScopeV1, record: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, record) || tenantScopeContainsV1(record, context);
}

function scopeAllowsMutation(context: IamTenantContextV1, record: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, record);
}

function cloneVersion(version: ArtifactVersionV1): ArtifactVersionV1 {
  return Object.freeze({ ...version, tenantScope: Object.freeze({ ...version.tenantScope }) });
}

function clonePlacement(placement: ContentPlacementV1): ContentPlacementV1 {
  return Object.freeze({ ...placement, tenantScope: Object.freeze({ ...placement.tenantScope }) });
}

function cloneEvidence(evidence: EvidenceReferenceV1): EvidenceReferenceV1 {
  return Object.freeze({
    ...evidence,
    tenantScope: Object.freeze({ ...evidence.tenantScope }),
    coordinate: Object.freeze({ ...evidence.coordinate }),
  });
}

/** In-memory adapter used by contract tests until the PostgreSQL adapter is wired. */
export class InMemoryArtifactRepositoryAdapter implements ArtifactRepositoryPortV1 {
  private versions = new Map<string, ArtifactVersionV1>();
  private placements = new Map<string, ContentPlacementV1>();
  private evidence = new Map<string, EvidenceReferenceV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  async saveVersion(context: IamTenantContextV1, version: ArtifactVersionV1): Promise<void> {
    await Promise.resolve();
    if (!scopeAllowsMutation(context, version.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = this.versions.get(version.versionId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(version))
      throw new Error('IAE_IMMUTABLE_VERSION');
    this.versions.set(version.versionId, cloneVersion(version));
  }

  async findVersion(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<ArtifactVersionV1 | undefined> {
    await Promise.resolve();
    const version = this.versions.get(versionId);
    return version && visibleInScope(context.tenantScope, version.tenantScope)
      ? cloneVersion(version)
      : undefined;
  }

  async updateVersionStatus(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
    status: ArtifactVersionV1['status'],
    scanState?: ArtifactScanStateV1,
  ): Promise<ArtifactVersionV1 | undefined> {
    await Promise.resolve();
    const current = this.versions.get(versionId);
    if (!current || !visibleInScope(context.tenantScope, current.tenantScope)) return undefined;
    if (!scopeAllowsMutation(context, current.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    if (!['QUARANTINED', 'ACTIVE', 'DELETED'].includes(status))
      throw new Error('IAE_INVALID_STATUS');
    if (current.status === 'DELETED' && status !== 'DELETED')
      throw new Error('IAE_TERMINAL_STATUS');
    const next = cloneVersion({ ...current, status, scanState: scanState ?? current.scanState });
    this.versions.set(versionId, next);
    return next;
  }

  async savePlacement(context: IamTenantContextV1, placement: ContentPlacementV1): Promise<void> {
    await Promise.resolve();
    if (!scopeAllowsMutation(context, placement.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    if (!this.versions.has(placement.artifactVersionId)) throw new Error('IAE_VERSION_NOT_FOUND');
    const existing = this.placements.get(placement.placementId);
    if (existing && JSON.stringify(existing) === JSON.stringify(placement)) return;
    if (existing && context.expectedRevision !== existing.revision)
      throw new Error('IAE_REVISION_CONFLICT');
    if (!existing && context.expectedRevision !== undefined)
      throw new Error('IAE_REVISION_CONFLICT');
    this.placements.set(placement.placementId, clonePlacement(placement));
  }

  async listPlacements(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<readonly ContentPlacementV1[]> {
    await Promise.resolve();
    return [...this.placements.values()]
      .filter(
        (placement) =>
          placement.artifactVersionId === versionId &&
          visibleInScope(context.tenantScope, placement.tenantScope),
      )
      .map(clonePlacement);
  }

  async updatePlacement(context: IamTenantContextV1, placement: ContentPlacementV1): Promise<void> {
    await Promise.resolve();
    if (!scopeAllowsMutation(context, placement.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = this.placements.get(placement.placementId);
    if (!existing) throw new Error('IAE_PLACEMENT_NOT_FOUND');
    if (JSON.stringify(existing) === JSON.stringify(placement)) return;
    if (placement.revision !== existing.revision + 1) throw new Error('IAE_REVISION_CONFLICT');
    if (
      existing.artifactVersionId !== placement.artifactVersionId ||
      existing.kind !== placement.kind ||
      existing.opaqueReference !== placement.opaqueReference ||
      existing.contentSha256 !== placement.contentSha256
    )
      throw new Error('IAE_IMMUTABLE_PLACEMENT');
    this.placements.set(placement.placementId, clonePlacement(placement));
  }

  async saveEvidence(context: IamTenantContextV1, evidence: EvidenceReferenceV1): Promise<void> {
    await Promise.resolve();
    if (!scopeAllowsMutation(context, evidence.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    if (!this.versions.has(evidence.artifactVersionId)) throw new Error('IAE_VERSION_NOT_FOUND');
    const existing = this.evidence.get(evidence.evidenceId);
    if (existing && JSON.stringify(existing) === JSON.stringify(evidence)) return;
    if (existing) throw new Error('IAE_IMMUTABLE_EVIDENCE');
    this.evidence.set(evidence.evidenceId, cloneEvidence(evidence));
  }

  async listEvidence(
    context: IamTenantContextV1,
    versionId: EvidenceReferenceV1['artifactVersionId'],
  ): Promise<readonly EvidenceReferenceV1[]> {
    await Promise.resolve();
    return [...this.evidence.values()]
      .filter(
        (evidence) =>
          evidence.artifactVersionId === versionId &&
          visibleInScope(context.tenantScope, evidence.tenantScope),
      )
      .map(cloneEvidence);
  }

  async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const beforeVersions = new Map(this.versions);
    const beforePlacements = new Map(this.placements);
    const beforeEvidence = new Map(this.evidence);
    try {
      return await work({
        saveVersion: this.saveVersion.bind(this),
        findVersion: this.findVersion.bind(this),
        updateVersionStatus: this.updateVersionStatus.bind(this),
        savePlacement: this.savePlacement.bind(this),
        updatePlacement: this.updatePlacement.bind(this),
        listPlacements: this.listPlacements.bind(this),
        saveEvidence: this.saveEvidence.bind(this),
        listEvidence: this.listEvidence.bind(this),
      });
    } catch (error) {
      this.versions = beforeVersions;
      this.placements = beforePlacements;
      this.evidence = beforeEvidence;
      throw error;
    } finally {
      release();
    }
  }
}
