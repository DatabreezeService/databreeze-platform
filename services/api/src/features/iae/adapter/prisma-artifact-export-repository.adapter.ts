import {
  createArtifactExportManifestV1,
  type ArtifactExportManifestV1,
} from '@databreeze/domain/artifact-export/v1';
import {
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactExportRepositoryPortV1,
  ArtifactExportTransactionPortV1,
} from '../application/artifact-export-repository.port.js';

export interface ArtifactExportDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly entries: unknown;
  readonly approvalState: string;
  readonly createdAt: Date;
  readonly canonicalHash: string;
}

export interface ArtifactExportDatabaseClientV1 {
  readonly artifactExportManifestRecord: {
    create(input: {
      readonly data: ArtifactExportDatabaseRowV1;
    }): Promise<ArtifactExportDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<ArtifactExportDatabaseRowV1 | null>;
  };
  $transaction<TValue>(
    work: (transaction: ArtifactExportDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function rowScope(row: ArtifactExportDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function rowToDomain(row: ArtifactExportDatabaseRowV1): ArtifactExportManifestV1 {
  const createdAt = row.createdAt.toISOString();
  if (!parseStrictUtcTimestampV1(createdAt).accepted)
    throw new Error('IAE_PERSISTED_TIMESTAMP_INVALID');
  const parsed = createArtifactExportManifestV1({
    manifestId: row.id,
    tenantScope: rowScope(row),
    entries: row.entries,
    approvalState: row.approvalState,
    createdAt,
    canonicalHash: row.canonicalHash,
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_EXPORT_MANIFEST_INVALID');
  return parsed.value;
}

function domainToCreate(manifest: ArtifactExportManifestV1): ArtifactExportDatabaseRowV1 {
  return {
    ...databaseScope(manifest.tenantScope),
    id: manifest.manifestId,
    entries: manifest.entries,
    approvalState: manifest.approvalState,
    createdAt: new Date(manifest.createdAt),
    canonicalHash: manifest.canonicalHash,
  };
}

function visible(context: TenantScopeV1, row: ArtifactExportDatabaseRowV1): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaArtifactExportTransactionAdapter implements ArtifactExportTransactionPortV1 {
  public constructor(private readonly client: ArtifactExportDatabaseClientV1) {}

  public async save(
    context: IamTenantContextV1,
    manifest: ArtifactExportManifestV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, manifest.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.artifactExportManifestRecord.findUnique({
      where: { id: manifest.manifestId },
    });
    if (existing !== null) {
      const current = rowToDomain(existing);
      if (JSON.stringify(current) !== JSON.stringify(manifest))
        throw new Error('IAE_IMMUTABLE_EXPORT_MANIFEST');
      return;
    }
    await this.client.artifactExportManifestRecord.create({ data: domainToCreate(manifest) });
  }

  public async find(
    context: IamTenantContextV1,
    manifestId: ArtifactExportManifestV1['manifestId'],
  ): Promise<ArtifactExportManifestV1 | undefined> {
    const row = await this.client.artifactExportManifestRecord.findUnique({
      where: { id: manifestId },
    });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToDomain(row)
        : undefined;
  }
}

export class PrismaArtifactExportRepositoryAdapter implements ArtifactExportRepositoryPortV1 {
  public constructor(private readonly client: ArtifactExportDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactExportTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaArtifactExportTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, manifest: ArtifactExportManifestV1): Promise<void> {
    return new PrismaArtifactExportTransactionAdapter(this.client).save(context, manifest);
  }

  public find(
    context: IamTenantContextV1,
    manifestId: ArtifactExportManifestV1['manifestId'],
  ): Promise<ArtifactExportManifestV1 | undefined> {
    return new PrismaArtifactExportTransactionAdapter(this.client).find(context, manifestId);
  }
}
