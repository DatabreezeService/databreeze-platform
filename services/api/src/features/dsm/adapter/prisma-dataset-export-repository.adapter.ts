import {
  createDatasetExportManifestV1,
  type DatasetExportManifestV1,
} from '@databreeze/domain/dataset-export/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DatasetExportRepositoryPortV1,
  DatasetExportTransactionPortV1,
} from '../application/dataset-export-repository.port.js';

export interface DatasetExportDatabaseRowV1 {
  readonly id: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly dataMode: string;
  readonly payloadClass: string;
  readonly format: string;
  readonly rowCount: bigint | number;
  readonly byteSize: bigint | number;
  readonly contentSha256: string;
  readonly schemaVersionId: string;
  readonly mappingVersionId: string;
  readonly ruleSetVersionId: string;
  readonly semanticManifestHash: string;
  readonly metricManifestHash: string;
  readonly qualityManifestHash: string;
  readonly lineageManifestHash: string;
  readonly evidenceManifestHash: string;
  readonly policyHash: string;
  readonly qualityState: string;
  readonly approvalState: string;
  readonly createdAt: Date;
}

export interface DatasetExportDatabaseCreateDataV1
  extends Omit<DatasetExportDatabaseRowV1, 'rowCount' | 'byteSize'> {
  readonly rowCount: bigint;
  readonly byteSize: bigint;
}

export interface DatasetExportDatabaseClientV1 {
  readonly datasetExportManifestRecord: {
    create(input: {
      readonly data: DatasetExportDatabaseCreateDataV1;
    }): Promise<DatasetExportDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<DatasetExportDatabaseRowV1 | null>;
  };
  $transaction<TValue>(
    work: (transaction: DatasetExportDatabaseClientV1) => Promise<TValue>,
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

function rowScope(row: DatasetExportDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function safeInteger(input: bigint | number): number {
  const value = typeof input === 'bigint' ? Number(input) : input;
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('DSM_PERSISTED_EXPORT_SIZE_INVALID');
  return value;
}

function rowToDomain(row: DatasetExportDatabaseRowV1): DatasetExportManifestV1 {
  const parsed = createDatasetExportManifestV1({
    manifestId: row.id,
    datasetId: row.datasetId,
    datasetVersionId: row.datasetVersionId,
    tenantScope: rowScope(row),
    dataMode: row.dataMode,
    payloadClass: row.payloadClass,
    format: row.format,
    rowCount: safeInteger(row.rowCount),
    byteSize: safeInteger(row.byteSize),
    contentSha256: row.contentSha256,
    schemaVersionId: row.schemaVersionId,
    mappingVersionId: row.mappingVersionId,
    ruleSetVersionId: row.ruleSetVersionId,
    semanticManifestHash: row.semanticManifestHash,
    metricManifestHash: row.metricManifestHash,
    qualityManifestHash: row.qualityManifestHash,
    lineageManifestHash: row.lineageManifestHash,
    evidenceManifestHash: row.evidenceManifestHash,
    policyHash: row.policyHash,
    qualityState: row.qualityState,
    approvalState: row.approvalState,
    createdAt: row.createdAt.toISOString(),
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_EXPORT_INVALID');
  return parsed.value;
}

function domainToCreate(manifest: DatasetExportManifestV1): DatasetExportDatabaseCreateDataV1 {
  return {
    ...databaseScope(manifest.tenantScope),
    id: manifest.manifestId,
    datasetId: manifest.datasetId,
    datasetVersionId: manifest.datasetVersionId,
    dataMode: manifest.dataMode,
    payloadClass: manifest.payloadClass,
    format: manifest.format,
    rowCount: BigInt(manifest.rowCount),
    byteSize: BigInt(manifest.byteSize),
    contentSha256: manifest.contentSha256,
    schemaVersionId: manifest.schemaVersionId,
    mappingVersionId: manifest.mappingVersionId,
    ruleSetVersionId: manifest.ruleSetVersionId,
    semanticManifestHash: manifest.semanticManifestHash,
    metricManifestHash: manifest.metricManifestHash,
    qualityManifestHash: manifest.qualityManifestHash,
    lineageManifestHash: manifest.lineageManifestHash,
    evidenceManifestHash: manifest.evidenceManifestHash,
    policyHash: manifest.policyHash,
    qualityState: manifest.qualityState,
    approvalState: manifest.approvalState,
    createdAt: new Date(manifest.createdAt),
  };
}

function visible(context: TenantScopeV1, row: DatasetExportDatabaseRowV1): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaDatasetExportTransactionAdapter implements DatasetExportTransactionPortV1 {
  public constructor(private readonly client: DatasetExportDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, manifest: DatasetExportManifestV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, manifest.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.datasetExportManifestRecord.findUnique({
      where: { id: manifest.manifestId },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToDomain(existing)) !== JSON.stringify(manifest))
        throw new Error('DSM_IMMUTABLE_EXPORT_MANIFEST');
      return;
    }
    await this.client.datasetExportManifestRecord.create({ data: domainToCreate(manifest) });
  }

  public async find(
    context: IamTenantContextV1,
    manifestId: DatasetExportManifestV1['manifestId'],
  ): Promise<DatasetExportManifestV1 | undefined> {
    const row = await this.client.datasetExportManifestRecord.findUnique({
      where: { id: manifestId },
    });
    return row !== null && visible(context.tenantScope, row) ? rowToDomain(row) : undefined;
  }
}

export class PrismaDatasetExportRepositoryAdapter implements DatasetExportRepositoryPortV1 {
  public constructor(private readonly client: DatasetExportDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetExportTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaDatasetExportTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, manifest: DatasetExportManifestV1): Promise<void> {
    return new PrismaDatasetExportTransactionAdapter(this.client).save(context, manifest);
  }

  public find(
    context: IamTenantContextV1,
    manifestId: DatasetExportManifestV1['manifestId'],
  ): Promise<DatasetExportManifestV1 | undefined> {
    return new PrismaDatasetExportTransactionAdapter(this.client).find(context, manifestId);
  }
}
