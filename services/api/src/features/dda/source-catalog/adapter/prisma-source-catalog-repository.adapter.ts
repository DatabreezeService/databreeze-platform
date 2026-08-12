import {
  tenantScopeContainsV1,
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  SourceCatalogRecordV1,
  SourceCatalogRepositoryPortV1,
  SourceCatalogSourceTypeV1,
  SourceCatalogStatusV1,
  SourceCatalogHealthV1,
} from '../application/source-catalog-repository.port.js';

export interface SourceCatalogDatabaseRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly dsmDatasetId: string;
  readonly iaeArtifactVersionId: string;
  readonly sourceType: string;
  readonly safeDisplayLabel: string;
  readonly status: string;
  readonly health: string;
  readonly revision: number;
  readonly updatedAt: Date;
}

interface SourceCatalogDelegateV1 {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: ReadonlyArray<Readonly<Record<string, 'asc' | 'desc'>>>;
  }): Promise<readonly SourceCatalogDatabaseRowV1[]>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<SourceCatalogDatabaseRowV1 | null>;
}

export interface SourceCatalogDatabaseClientV1 {
  readonly ddaDatasetSource: SourceCatalogDelegateV1;
}

function recordFromRow(row: SourceCatalogDatabaseRowV1): SourceCatalogRecordV1 | undefined {
  const id = parseStableIdentifierV1(row.id);
  const organizationId = parseStableIdentifierV1(row.organizationId);
  const workspaceId = parseStableIdentifierV1(row.workspaceId);
  const dsmDatasetId = parseStableIdentifierV1(row.dsmDatasetId);
  const iaeArtifactVersionId = parseStableIdentifierV1(row.iaeArtifactVersionId);
  const updatedAt = parseStrictUtcTimestampV1(row.updatedAt.toISOString());
  if (
    !id.accepted ||
    !organizationId.accepted ||
    !workspaceId.accepted ||
    !dsmDatasetId.accepted ||
    !iaeArtifactVersionId.accepted ||
    !updatedAt.accepted
  ) {
    return undefined;
  }
  const projectId =
    row.projectId === null ? undefined : parseStableIdentifierV1(row.projectId);
  if (row.projectId !== null && (!projectId || !projectId.accepted)) return undefined;
  return Object.freeze({
    id: id.value,
    organizationId: organizationId.value,
    workspaceId: workspaceId.value,
    ...(projectId && projectId.accepted ? { projectId: projectId.value } : {}),
    dsmDatasetId: dsmDatasetId.value,
    iaeArtifactVersionId: iaeArtifactVersionId.value,
    sourceType: row.sourceType as SourceCatalogSourceTypeV1,
    safeDisplayLabel: row.safeDisplayLabel,
    status: row.status as SourceCatalogStatusV1,
    health: row.health as SourceCatalogHealthV1,
    versionId: iaeArtifactVersionId.value,
    dataMode: 'CLOUD' as const,
    revision: row.revision,
    updatedAt: updatedAt.value,
  });
}

function workspaceFilter(context: IamTenantContextV1): Readonly<Record<string, unknown>> | undefined {
  if (context.tenantScope.scopeType !== 'workspace' || !context.tenantScope.workspaceId) {
    return undefined;
  }
  return {
    organizationId: context.tenantScope.organizationId,
    workspaceId: context.tenantScope.workspaceId,
  };
}

/** Prisma adapter for DDA-052 dataset source catalog metadata. */
export class PrismaSourceCatalogRepositoryAdapter implements SourceCatalogRepositoryPortV1 {
  public constructor(private readonly db: SourceCatalogDatabaseClientV1) {}

  public async listByDataset(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly SourceCatalogRecordV1[]> {
    const filter = workspaceFilter(context);
    if (!filter) return [];
    const rows = await this.db.ddaDatasetSource.findMany({
      where: { ...filter, dsmDatasetId: datasetId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    return rows
      .map((row) => recordFromRow(row))
      .filter((record): record is SourceCatalogRecordV1 => record !== undefined)
      .filter((record) =>
        tenantScopeContainsV1(context.tenantScope, {
          scopeType: 'workspace',
          organizationId: record.organizationId,
          workspaceId: record.workspaceId,
        }),
      );
  }

  public async findSource(
    context: IamTenantContextV1,
    sourceId: StableIdentifierV1,
  ): Promise<SourceCatalogRecordV1 | undefined> {
    const filter = workspaceFilter(context);
    if (!filter) return undefined;
    const row = await this.db.ddaDatasetSource.findFirst({
      where: { ...filter, id: sourceId },
    });
    if (!row) return undefined;
    const record = recordFromRow(row);
    if (!record) return undefined;
    return tenantScopeContainsV1(context.tenantScope, {
      scopeType: 'workspace',
      organizationId: record.organizationId,
      workspaceId: record.workspaceId,
    })
      ? record
      : undefined;
  }
}
