import {
  createDatasetQualityResultV1,
  type DatasetQualityResultV1,
} from '@databreeze/domain/dataset-quality/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DatasetQualityRepositoryPortV1,
  DatasetQualityTransactionPortV1,
} from '../application/dataset-quality-repository.port.js';
import { isPrismaUniqueConstraintViolationV1 } from './prisma-error.js';

export interface DatasetQualityDatabaseRowV1 {
  readonly id: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly ruleSetVersionId: string;
  readonly profileFingerprint: string;
  readonly rowCountScanned: bigint | number;
  readonly qualityState: string;
  readonly findings: unknown;
  readonly resultFingerprint: string;
  readonly createdAt: Date;
}

export interface DatasetQualityDatabaseCreateDataV1
  extends Omit<DatasetQualityDatabaseRowV1, 'rowCountScanned' | 'createdAt'> {
  readonly rowCountScanned: bigint;
  readonly createdAt: Date;
}

export interface DatasetQualityDatabaseClientV1 {
  readonly datasetQualityResultRecord: {
    create(input: {
      readonly data: DatasetQualityDatabaseCreateDataV1;
    }): Promise<DatasetQualityDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<DatasetQualityDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, string>>;
      readonly orderBy: { readonly id: 'asc' };
    }): Promise<readonly DatasetQualityDatabaseRowV1[]>;
  };
  $transaction<TValue>(
    work: (transaction: DatasetQualityDatabaseClientV1) => Promise<TValue>,
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

function rowScope(row: DatasetQualityDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function rowToDomain(row: DatasetQualityDatabaseRowV1): DatasetQualityResultV1 {
  const parsed = createDatasetQualityResultV1({
    resultId: row.id,
    datasetId: row.datasetId,
    datasetVersionId: row.datasetVersionId,
    tenantScope: rowScope(row),
    ruleSetVersionId: row.ruleSetVersionId,
    profileFingerprint: row.profileFingerprint,
    rowCountScanned:
      typeof row.rowCountScanned === 'bigint' ? Number(row.rowCountScanned) : row.rowCountScanned,
    qualityState: row.qualityState,
    findings: row.findings,
    resultFingerprint: row.resultFingerprint,
    createdAt: row.createdAt.toISOString(),
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_QUALITY_RESULT_INVALID');
  return parsed.value;
}

function domainToCreate(result: DatasetQualityResultV1): DatasetQualityDatabaseCreateDataV1 {
  return {
    ...databaseScope(result.tenantScope),
    id: result.resultId,
    datasetId: result.datasetId,
    datasetVersionId: result.datasetVersionId,
    ruleSetVersionId: result.ruleSetVersionId,
    profileFingerprint: result.profileFingerprint,
    rowCountScanned: BigInt(result.rowCountScanned),
    qualityState: result.qualityState,
    findings: result.findings,
    resultFingerprint: result.resultFingerprint,
    createdAt: new Date(result.createdAt),
  };
}

function visible(context: TenantScopeV1, row: DatasetQualityDatabaseRowV1): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaDatasetQualityTransactionAdapter implements DatasetQualityTransactionPortV1 {
  public constructor(private readonly client: DatasetQualityDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, result: DatasetQualityResultV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, result.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.datasetQualityResultRecord.findUnique({
      where: { id: result.resultId },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToDomain(existing)) !== JSON.stringify(result))
        throw new Error('DSM_IMMUTABLE_QUALITY_RESULT');
      return;
    }
    try {
      await this.client.datasetQualityResultRecord.create({ data: domainToCreate(result) });
    } catch (error) {
      if (isPrismaUniqueConstraintViolationV1(error))
        throw new Error('DSM_IMMUTABLE_QUALITY_RESULT');
      throw error;
    }
  }

  public async find(
    context: IamTenantContextV1,
    resultId: DatasetQualityResultV1['resultId'],
  ): Promise<DatasetQualityResultV1 | undefined> {
    const row = await this.client.datasetQualityResultRecord.findUnique({
      where: { id: resultId },
    });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToDomain(row)
        : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    datasetVersionId: DatasetQualityResultV1['datasetVersionId'],
  ): Promise<readonly DatasetQualityResultV1[]> {
    const rows = await this.client.datasetQualityResultRecord.findMany({
      where: { datasetVersionId, organizationId: context.tenantScope.organizationId },
      orderBy: { id: 'asc' },
    });
    return rows.filter((row) => visible(context.tenantScope, row)).map(rowToDomain);
  }
}

export class PrismaDatasetQualityRepositoryAdapter implements DatasetQualityRepositoryPortV1 {
  public constructor(private readonly client: DatasetQualityDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetQualityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaDatasetQualityTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, result: DatasetQualityResultV1): Promise<void> {
    return new PrismaDatasetQualityTransactionAdapter(this.client).save(context, result);
  }

  public find(
    context: IamTenantContextV1,
    resultId: DatasetQualityResultV1['resultId'],
  ): Promise<DatasetQualityResultV1 | undefined> {
    return new PrismaDatasetQualityTransactionAdapter(this.client).find(context, resultId);
  }

  public list(
    context: IamTenantContextV1,
    datasetVersionId: DatasetQualityResultV1['datasetVersionId'],
  ): Promise<readonly DatasetQualityResultV1[]> {
    return new PrismaDatasetQualityTransactionAdapter(this.client).list(context, datasetVersionId);
  }
}
