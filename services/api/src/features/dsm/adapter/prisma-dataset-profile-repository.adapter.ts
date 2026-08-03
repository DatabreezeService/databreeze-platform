import {
  createDatasetProfileV1,
  type DatasetProfileV1,
} from '@databreeze/domain/dataset-profile/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DatasetProfileRepositoryPortV1,
  DatasetProfileTransactionPortV1,
} from '../application/dataset-profile-repository.port.js';
import { isPrismaUniqueConstraintViolationV1 } from '../../../platform/prisma-error.js';

export interface DatasetProfileDatabaseRowV1 {
  readonly id: string;
  readonly datasetVersionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly completeness: string;
  readonly samplingMethod: string;
  readonly samplingSeed: string | null;
  readonly excludedScopes: unknown;
  readonly rowCountScanned: bigint | number;
  readonly rowCountAvailable: bigint | number | null;
  readonly maxRows: bigint | number;
  readonly maxBytes: bigint | number;
  readonly maxDurationMs: bigint | number;
  readonly profileFingerprint: string;
  readonly createdAt: Date;
}

export interface DatasetProfileDatabaseCreateDataV1
  extends Omit<
    DatasetProfileDatabaseRowV1,
    'rowCountScanned' | 'rowCountAvailable' | 'maxRows' | 'maxBytes' | 'maxDurationMs' | 'createdAt'
  > {
  readonly rowCountScanned: bigint;
  readonly rowCountAvailable: bigint | null;
  readonly maxRows: bigint;
  readonly maxBytes: bigint;
  readonly maxDurationMs: bigint;
  readonly createdAt: Date;
}

export interface DatasetProfileDatabaseClientV1 {
  readonly datasetProfileRecord: {
    create(input: {
      readonly data: DatasetProfileDatabaseCreateDataV1;
    }): Promise<DatasetProfileDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<DatasetProfileDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, string>>;
      readonly orderBy: { readonly id: 'asc' };
    }): Promise<readonly DatasetProfileDatabaseRowV1[]>;
  };
  $transaction<TValue>(
    work: (transaction: DatasetProfileDatabaseClientV1) => Promise<TValue>,
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

function rowScope(row: DatasetProfileDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function numberValue(value: bigint | number): number {
  const normalized = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(normalized)) throw new Error('DSM_PERSISTED_PROFILE_COUNT_INVALID');
  return normalized;
}

function rowToDomain(row: DatasetProfileDatabaseRowV1): DatasetProfileV1 {
  const parsed = createDatasetProfileV1({
    profileId: row.id,
    datasetVersionId: row.datasetVersionId,
    tenantScope: rowScope(row),
    completeness: row.completeness,
    samplingMethod: row.samplingMethod,
    ...(row.samplingSeed === null ? {} : { samplingSeed: row.samplingSeed }),
    excludedScopes: row.excludedScopes,
    rowCountScanned: numberValue(row.rowCountScanned),
    ...(row.rowCountAvailable === null
      ? {}
      : { rowCountAvailable: numberValue(row.rowCountAvailable) }),
    resourceLimits: {
      maxRows: numberValue(row.maxRows),
      maxBytes: numberValue(row.maxBytes),
      maxDurationMs: numberValue(row.maxDurationMs),
    },
    profileFingerprint: row.profileFingerprint,
    createdAt: row.createdAt.toISOString(),
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_PROFILE_INVALID');
  return parsed.value;
}

function domainToCreate(profile: DatasetProfileV1): DatasetProfileDatabaseCreateDataV1 {
  return {
    ...databaseScope(profile.tenantScope),
    id: profile.profileId,
    datasetVersionId: profile.datasetVersionId,
    completeness: profile.completeness,
    samplingMethod: profile.samplingMethod,
    samplingSeed: profile.samplingSeed ?? null,
    excludedScopes: profile.excludedScopes,
    rowCountScanned: BigInt(profile.rowCountScanned),
    rowCountAvailable:
      profile.rowCountAvailable === undefined ? null : BigInt(profile.rowCountAvailable),
    maxRows: BigInt(profile.resourceLimits.maxRows),
    maxBytes: BigInt(profile.resourceLimits.maxBytes),
    maxDurationMs: BigInt(profile.resourceLimits.maxDurationMs),
    profileFingerprint: profile.profileFingerprint,
    createdAt: new Date(profile.createdAt),
  };
}

function visible(context: TenantScopeV1, row: DatasetProfileDatabaseRowV1): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaDatasetProfileTransactionAdapter implements DatasetProfileTransactionPortV1 {
  public constructor(private readonly client: DatasetProfileDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, profile: DatasetProfileV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, profile.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.datasetProfileRecord.findUnique({
      where: { id: profile.profileId },
    });
    if (existing !== null) {
      if (!visible(context.tenantScope, existing))
        throw new Error('DSM_IMMUTABLE_DATASET_PROFILE');
      if (JSON.stringify(rowToDomain(existing)) !== JSON.stringify(profile))
        throw new Error('DSM_IMMUTABLE_DATASET_PROFILE');
      return;
    }
    try {
      await this.client.datasetProfileRecord.create({ data: domainToCreate(profile) });
    } catch (error) {
      if (isPrismaUniqueConstraintViolationV1(error))
        throw new Error('DSM_IMMUTABLE_DATASET_PROFILE');
      throw error;
    }
  }

  public async find(
    context: IamTenantContextV1,
    profileId: DatasetProfileV1['profileId'],
  ): Promise<DatasetProfileV1 | undefined> {
    const row = await this.client.datasetProfileRecord.findUnique({ where: { id: profileId } });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToDomain(row)
        : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    datasetVersionId: DatasetProfileV1['datasetVersionId'],
  ): Promise<readonly DatasetProfileV1[]> {
    const rows = await this.client.datasetProfileRecord.findMany({
      where: { datasetVersionId, organizationId: context.tenantScope.organizationId },
      orderBy: { id: 'asc' },
    });
    return rows.filter((row) => visible(context.tenantScope, row)).map(rowToDomain);
  }
}

export class PrismaDatasetProfileRepositoryAdapter implements DatasetProfileRepositoryPortV1 {
  public constructor(private readonly client: DatasetProfileDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetProfileTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaDatasetProfileTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, profile: DatasetProfileV1): Promise<void> {
    return new PrismaDatasetProfileTransactionAdapter(this.client).save(context, profile);
  }

  public find(
    context: IamTenantContextV1,
    profileId: DatasetProfileV1['profileId'],
  ): Promise<DatasetProfileV1 | undefined> {
    return new PrismaDatasetProfileTransactionAdapter(this.client).find(context, profileId);
  }

  public list(
    context: IamTenantContextV1,
    datasetVersionId: DatasetProfileV1['datasetVersionId'],
  ): Promise<readonly DatasetProfileV1[]> {
    return new PrismaDatasetProfileTransactionAdapter(this.client).list(context, datasetVersionId);
  }
}
