import {
  createArtifactVersionV1,
  createContentPlacementV1,
  createEvidenceReferenceV1,
  type ArtifactScanStateV1,
  type ArtifactVersionV1,
  type ContentPlacementV1,
  type EvidenceReferenceV1,
} from '@databreeze/domain/artifact/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactRepositoryPortV1,
  ArtifactTransactionPortV1,
} from '../application/artifact-repository.port.js';

export interface ArtifactVersionDatabaseRowV1 {
  readonly id: string;
  readonly artifactId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly sourceKind: string;
  readonly dataMode: string;
  readonly contentSha256: string;
  readonly byteSize: bigint | number;
  readonly mediaType: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly status: string;
  readonly scanState?: string;
}

export interface ContentPlacementDatabaseRowV1 {
  readonly id: string;
  readonly artifactVersionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly kind: string;
  readonly opaqueReference: string;
  readonly contentSha256: string;
  readonly available: boolean;
  readonly revision: number;
}

export interface EvidenceDatabaseRowV1 {
  readonly id: string;
  readonly artifactVersionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly coordinate: unknown;
  readonly sourceState: string;
  readonly excerpt: string | null;
}

interface ArtifactVersionCreateDataV1
  extends Omit<ArtifactVersionDatabaseRowV1, 'byteSize' | 'createdAt'> {
  readonly byteSize: bigint;
  readonly createdAt: Date;
}
interface ContentPlacementCreateDataV1 extends Omit<ContentPlacementDatabaseRowV1, never> {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
interface EvidenceCreateDataV1 extends Omit<EvidenceDatabaseRowV1, never> {
  readonly createdAt: Date;
}

export interface ArtifactDatabaseClientV1 {
  readonly artifactVersion: {
    create(input: {
      readonly data: ArtifactVersionCreateDataV1;
    }): Promise<ArtifactVersionDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<ArtifactVersionDatabaseRowV1 | null>;
    update(input: {
      readonly where: { readonly id: string };
      readonly data: { readonly status: string; readonly scanState: ArtifactScanStateV1 };
    }): Promise<ArtifactVersionDatabaseRowV1>;
  };
  readonly contentPlacement: {
    create(input: {
      readonly data: ContentPlacementCreateDataV1;
    }): Promise<ContentPlacementDatabaseRowV1>;
    findMany(input: {
      readonly where: Readonly<Record<string, string>>;
    }): Promise<readonly ContentPlacementDatabaseRowV1[]>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<ContentPlacementDatabaseRowV1 | null>;
    update(input: {
      readonly where: { readonly id: string };
      readonly data: { readonly available: boolean; readonly revision: number };
    }): Promise<ContentPlacementDatabaseRowV1>;
  };
  readonly evidenceReference: {
    create(input: { readonly data: EvidenceCreateDataV1 }): Promise<EvidenceDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<EvidenceDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, string>>;
    }): Promise<readonly EvidenceDatabaseRowV1[]>;
  };
  $transaction<TValue>(
    work: (transaction: ArtifactDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function rowScope(
  row: ArtifactVersionDatabaseRowV1 | ContentPlacementDatabaseRowV1 | EvidenceDatabaseRowV1,
): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function rowToVersion(row: ArtifactVersionDatabaseRowV1): ArtifactVersionV1 {
  const byteSize = typeof row.byteSize === 'bigint' ? Number(row.byteSize) : row.byteSize;
  const parsed = createArtifactVersionV1({
    artifactId: row.artifactId,
    versionId: row.id,
    tenantScope: rowScope(row),
    sourceKind: row.sourceKind,
    dataMode: row.dataMode,
    contentSha256: row.contentSha256,
    byteSize,
    mediaType: row.mediaType,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    scanState: row.scanState ?? 'PENDING',
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_ARTIFACT_INVALID');
  return parsed.value;
}

function rowToPlacement(
  row: ContentPlacementDatabaseRowV1,
  version: ArtifactVersionV1,
): ContentPlacementV1 {
  const parsed = createContentPlacementV1({
    placementId: row.id,
    artifactVersion: version,
    tenantScope: rowScope(row),
    kind: row.kind,
    opaqueReference: row.opaqueReference,
    contentSha256: row.contentSha256,
    available: row.available,
    revision: row.revision,
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_PLACEMENT_INVALID');
  return parsed.value;
}

function rowToEvidence(
  row: EvidenceDatabaseRowV1,
  version: ArtifactVersionV1,
): EvidenceReferenceV1 {
  const parsed = createEvidenceReferenceV1({
    evidenceId: row.id,
    artifactVersion: version,
    tenantScope: rowScope(row),
    coordinate: row.coordinate,
    sourceState: row.sourceState,
    ...(row.excerpt === null ? {} : { excerpt: row.excerpt }),
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_EVIDENCE_INVALID');
  return parsed.value;
}

function visible(
  context: TenantScopeV1,
  row: ArtifactVersionDatabaseRowV1 | ContentPlacementDatabaseRowV1 | EvidenceDatabaseRowV1,
): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaArtifactTransactionAdapter implements ArtifactTransactionPortV1 {
  public constructor(private readonly client: ArtifactDatabaseClientV1) {}

  public async saveVersion(context: IamTenantContextV1, version: ArtifactVersionV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, version.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.artifactVersion.findUnique({
      where: { id: version.versionId },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToVersion(existing)) !== JSON.stringify(version))
        throw new Error('IAE_IMMUTABLE_VERSION');
      return;
    }
    await this.client.artifactVersion.create({
      data: {
        ...databaseScope(version.tenantScope),
        id: version.versionId,
        artifactId: version.artifactId,
        sourceKind: version.sourceKind,
        dataMode: version.dataMode,
        contentSha256: version.contentSha256,
        byteSize: BigInt(version.byteSize),
        mediaType: version.mediaType,
        displayName: version.displayName,
        createdAt: new Date(version.createdAt),
        status: version.status,
        scanState: version.scanState,
      },
    });
  }

  public async findVersion(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<ArtifactVersionV1 | undefined> {
    const row = await this.client.artifactVersion.findUnique({ where: { id: versionId } });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToVersion(row)
        : undefined;
  }

  public async updateVersionStatus(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
    status: ArtifactVersionV1['status'],
    scanState?: ArtifactScanStateV1,
  ): Promise<ArtifactVersionV1 | undefined> {
    const row = await this.client.artifactVersion.findUnique({ where: { id: versionId } });
    if (row === null || !visible(context.tenantScope, row)) return undefined;
    if (!tenantScopeContainsV1(context.tenantScope, rowScope(row)))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const current = rowToVersion(row);
    if (!['QUARANTINED', 'ACTIVE', 'DELETED'].includes(status))
      throw new Error('IAE_INVALID_STATUS');
    if (current.status === 'DELETED' && status !== 'DELETED')
      throw new Error('IAE_TERMINAL_STATUS');
    const updated = await this.client.artifactVersion.update({
      where: { id: versionId },
      data: { status, scanState: scanState ?? current.scanState },
    });
    return rowToVersion(updated);
  }

  public async savePlacement(
    context: IamTenantContextV1,
    placement: ContentPlacementV1,
  ): Promise<void> {
    const version = await this.client.artifactVersion.findUnique({
      where: { id: placement.artifactVersionId },
    });
    if (version === null) throw new Error('IAE_VERSION_NOT_FOUND');
    if (!tenantScopeContainsV1(context.tenantScope, placement.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.contentPlacement.findUnique({
      where: { id: placement.placementId },
    });
    if (existing !== null) {
      const persisted = rowToPlacement(existing, rowToVersion(version));
      if (JSON.stringify(persisted) === JSON.stringify(placement)) return;
      throw new Error('IAE_IMMUTABLE_PLACEMENT');
    }
    await this.client.contentPlacement.create({
      data: {
        ...databaseScope(placement.tenantScope),
        id: placement.placementId,
        artifactVersionId: placement.artifactVersionId,
        kind: placement.kind,
        opaqueReference: placement.opaqueReference,
        contentSha256: placement.contentSha256,
        available: placement.available,
        revision: placement.revision,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  public async listPlacements(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<readonly ContentPlacementV1[]> {
    const versionRow = await this.client.artifactVersion.findUnique({ where: { id: versionId } });
    if (versionRow === null || !visible(context.tenantScope, versionRow)) return [];
    const version = rowToVersion(versionRow);
    const rows = await this.client.contentPlacement.findMany({
      where: { artifactVersionId: versionId },
    });
    return rows
      .filter((row) => visible(context.tenantScope, row))
      .map((row) => rowToPlacement(row, version));
  }

  public async updatePlacement(
    context: IamTenantContextV1,
    placement: ContentPlacementV1,
  ): Promise<void> {
    const existing = await this.client.contentPlacement.findUnique({
      where: { id: placement.placementId },
    });
    if (existing === null) throw new Error('IAE_PLACEMENT_NOT_FOUND');
    if (!tenantScopeContainsV1(context.tenantScope, placement.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const versionRow = await this.client.artifactVersion.findUnique({
      where: { id: placement.artifactVersionId },
    });
    if (versionRow === null) throw new Error('IAE_VERSION_NOT_FOUND');
    const current = rowToPlacement(existing, rowToVersion(versionRow));
    if (JSON.stringify(current) === JSON.stringify(placement)) return;
    if (placement.revision !== current.revision + 1) throw new Error('IAE_REVISION_CONFLICT');
    if (
      current.artifactVersionId !== placement.artifactVersionId ||
      current.kind !== placement.kind ||
      current.opaqueReference !== placement.opaqueReference ||
      current.contentSha256 !== placement.contentSha256
    )
      throw new Error('IAE_IMMUTABLE_PLACEMENT');
    await this.client.contentPlacement.update({
      where: { id: placement.placementId },
      data: { available: placement.available, revision: placement.revision },
    });
  }

  public async saveEvidence(
    context: IamTenantContextV1,
    evidence: EvidenceReferenceV1,
  ): Promise<void> {
    const versionRow = await this.client.artifactVersion.findUnique({
      where: { id: evidence.artifactVersionId },
    });
    if (versionRow === null) throw new Error('IAE_VERSION_NOT_FOUND');
    if (!tenantScopeContainsV1(context.tenantScope, evidence.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.evidenceReference.findUnique({
      where: { id: evidence.evidenceId },
    });
    if (existing !== null) {
      const persisted = rowToEvidence(existing, rowToVersion(versionRow));
      if (JSON.stringify(persisted) === JSON.stringify(evidence)) return;
      throw new Error('IAE_IMMUTABLE_EVIDENCE');
    }
    await this.client.evidenceReference.create({
      data: {
        ...databaseScope(evidence.tenantScope),
        id: evidence.evidenceId,
        artifactVersionId: evidence.artifactVersionId,
        coordinate: evidence.coordinate,
        sourceState: evidence.sourceState,
        excerpt: evidence.excerpt ?? null,
        createdAt: new Date(),
      },
    });
  }

  public async listEvidence(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<readonly EvidenceReferenceV1[]> {
    const versionRow = await this.client.artifactVersion.findUnique({ where: { id: versionId } });
    if (versionRow === null || !visible(context.tenantScope, versionRow)) return [];
    const version = rowToVersion(versionRow);
    const rows = await this.client.evidenceReference.findMany({
      where: { artifactVersionId: versionId },
    });
    return rows
      .filter((row) => visible(context.tenantScope, row))
      .map((row) => rowToEvidence(row, version));
  }
}

export class PrismaArtifactRepositoryAdapter implements ArtifactRepositoryPortV1 {
  public constructor(private readonly client: ArtifactDatabaseClientV1) {}
  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaArtifactTransactionAdapter(transaction)),
    );
  }
  public saveVersion(context: IamTenantContextV1, version: ArtifactVersionV1): Promise<void> {
    return new PrismaArtifactTransactionAdapter(this.client).saveVersion(context, version);
  }
  public findVersion(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<ArtifactVersionV1 | undefined> {
    return new PrismaArtifactTransactionAdapter(this.client).findVersion(context, versionId);
  }
  public updateVersionStatus(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
    status: ArtifactVersionV1['status'],
  ): Promise<ArtifactVersionV1 | undefined> {
    return new PrismaArtifactTransactionAdapter(this.client).updateVersionStatus(
      context,
      versionId,
      status,
    );
  }
  public savePlacement(context: IamTenantContextV1, placement: ContentPlacementV1): Promise<void> {
    return new PrismaArtifactTransactionAdapter(this.client).savePlacement(context, placement);
  }
  public updatePlacement(
    context: IamTenantContextV1,
    placement: ContentPlacementV1,
  ): Promise<void> {
    return new PrismaArtifactTransactionAdapter(this.client).updatePlacement(context, placement);
  }
  public listPlacements(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<readonly ContentPlacementV1[]> {
    return new PrismaArtifactTransactionAdapter(this.client).listPlacements(context, versionId);
  }
  public saveEvidence(context: IamTenantContextV1, evidence: EvidenceReferenceV1): Promise<void> {
    return new PrismaArtifactTransactionAdapter(this.client).saveEvidence(context, evidence);
  }
  public listEvidence(
    context: IamTenantContextV1,
    versionId: ArtifactVersionV1['versionId'],
  ): Promise<readonly EvidenceReferenceV1[]> {
    return new PrismaArtifactTransactionAdapter(this.client).listEvidence(context, versionId);
  }
}
