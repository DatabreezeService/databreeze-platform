import {
  createDatasetVersionManifestV1,
  type DatasetVersionManifestV1,
} from '@databreeze/domain/dataset-governance/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DatasetVersionRepositoryPortV1,
  DatasetVersionTransactionPortV1,
} from '../application/dataset-version-repository.port.js';
import { isPrismaUniqueConstraintViolationV1 } from '../../../platform/prisma-error.js';

export interface DatasetVersionDatabaseRowV1 {
  readonly id: string;
  readonly datasetId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly inputArtifactVersionIds: unknown;
  readonly schemaVersionId: string;
  readonly mappingVersionId: string;
  readonly ruleSetVersionId: string;
  readonly engineBuild: string;
  readonly contentFingerprint: string;
  readonly rowCount: bigint | number;
  readonly qualityState: string;
  readonly lineageManifestHash: string;
  readonly createdAt: Date;
}

export interface DatasetVersionDatabaseCreateDataV1
  extends Omit<DatasetVersionDatabaseRowV1, 'rowCount' | 'createdAt'> {
  readonly rowCount: bigint;
  readonly createdAt: Date;
}

export interface DatasetVersionDatabaseClientV1 {
  readonly datasetVersionRecord: {
    create(input: {
      readonly data: DatasetVersionDatabaseCreateDataV1;
    }): Promise<DatasetVersionDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<DatasetVersionDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, string>>;
      readonly orderBy: { readonly id: 'asc' };
    }): Promise<readonly DatasetVersionDatabaseRowV1[]>;
  };
  $transaction<TValue>(
    work: (transaction: DatasetVersionDatabaseClientV1) => Promise<TValue>,
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

function rowScope(row: DatasetVersionDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function rowToDomain(row: DatasetVersionDatabaseRowV1): DatasetVersionManifestV1 {
  const parsed = createDatasetVersionManifestV1({
    datasetId: row.datasetId,
    versionId: row.id,
    tenantScope: rowScope(row),
    inputArtifactVersionIds: row.inputArtifactVersionIds,
    schemaVersionId: row.schemaVersionId,
    mappingVersionId: row.mappingVersionId,
    ruleSetVersionId: row.ruleSetVersionId,
    engineBuild: row.engineBuild,
    contentFingerprint: row.contentFingerprint,
    rowCount: typeof row.rowCount === 'bigint' ? Number(row.rowCount) : row.rowCount,
    qualityState: row.qualityState,
    lineageManifestHash: row.lineageManifestHash,
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_DATASET_VERSION_INVALID');
  return parsed.value;
}

function domainToCreate(version: DatasetVersionManifestV1): DatasetVersionDatabaseCreateDataV1 {
  return {
    ...databaseScope(version.tenantScope),
    id: version.versionId,
    datasetId: version.datasetId,
    inputArtifactVersionIds: version.inputArtifactVersionIds,
    schemaVersionId: version.schemaVersionId,
    mappingVersionId: version.mappingVersionId,
    ruleSetVersionId: version.ruleSetVersionId,
    engineBuild: version.engineBuild,
    contentFingerprint: version.contentFingerprint,
    rowCount: BigInt(version.rowCount),
    qualityState: version.qualityState,
    lineageManifestHash: version.lineageManifestHash,
    createdAt: new Date(),
  };
}

function visible(context: TenantScopeV1, row: DatasetVersionDatabaseRowV1): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaDatasetVersionTransactionAdapter implements DatasetVersionTransactionPortV1 {
  public constructor(private readonly client: DatasetVersionDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, version: DatasetVersionManifestV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, version.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.datasetVersionRecord.findUnique({
      where: { id: version.versionId },
    });
    if (existing !== null) {
      if (!visible(context.tenantScope, existing))
        throw new Error('DSM_IMMUTABLE_DATASET_VERSION');
      if (JSON.stringify(rowToDomain(existing)) !== JSON.stringify(version))
        throw new Error('DSM_IMMUTABLE_DATASET_VERSION');
      return;
    }
    try {
      await this.client.datasetVersionRecord.create({ data: domainToCreate(version) });
    } catch (error) {
      if (isPrismaUniqueConstraintViolationV1(error))
        throw new Error('DSM_IMMUTABLE_DATASET_VERSION');
      throw error;
    }
  }

  public async find(
    context: IamTenantContextV1,
    versionId: DatasetVersionManifestV1['versionId'],
  ): Promise<DatasetVersionManifestV1 | undefined> {
    const row = await this.client.datasetVersionRecord.findUnique({ where: { id: versionId } });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToDomain(row)
        : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    datasetId: DatasetVersionManifestV1['datasetId'],
  ): Promise<readonly DatasetVersionManifestV1[]> {
    const rows = await this.client.datasetVersionRecord.findMany({
      where: { datasetId, organizationId: context.tenantScope.organizationId },
      orderBy: { id: 'asc' },
    });
    return rows.filter((row) => visible(context.tenantScope, row)).map(rowToDomain);
  }
}

export class PrismaDatasetVersionRepositoryAdapter implements DatasetVersionRepositoryPortV1 {
  public constructor(private readonly client: DatasetVersionDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetVersionTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaDatasetVersionTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, version: DatasetVersionManifestV1): Promise<void> {
    return new PrismaDatasetVersionTransactionAdapter(this.client).save(context, version);
  }

  public find(
    context: IamTenantContextV1,
    versionId: DatasetVersionManifestV1['versionId'],
  ): Promise<DatasetVersionManifestV1 | undefined> {
    return new PrismaDatasetVersionTransactionAdapter(this.client).find(context, versionId);
  }

  public list(
    context: IamTenantContextV1,
    datasetId: DatasetVersionManifestV1['datasetId'],
  ): Promise<readonly DatasetVersionManifestV1[]> {
    return new PrismaDatasetVersionTransactionAdapter(this.client).list(context, datasetId);
  }
}
