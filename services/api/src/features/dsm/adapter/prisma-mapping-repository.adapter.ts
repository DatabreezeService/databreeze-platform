import { createMappingDefinitionV1, type MappingDefinitionV1 } from '@databreeze/domain/mapping/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  MappingRepositoryPortV1,
  MappingTransactionPortV1,
} from '../application/mapping-repository.port.js';

export interface MappingDatabaseRowV1 {
  readonly id: string;
  readonly datasetId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly sourceSchemaVersionId: string;
  readonly targetSchemaVersionId: string;
  readonly steps: unknown;
  readonly status: string;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  readonly revision: number;
  readonly canonicalHash: string;
}

export interface MappingDatabaseCreateDataV1
  extends Omit<MappingDatabaseRowV1, 'createdAt' | 'publishedAt' | 'steps'> {
  readonly steps: unknown;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  readonly revision: number;
}

export interface MappingDatabaseClientV1 {
  readonly mappingDefinitionRecord: {
    create(input: { readonly data: MappingDatabaseCreateDataV1 }): Promise<MappingDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<MappingDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, string>>;
      readonly orderBy: { readonly createdAt: 'asc' };
    }): Promise<readonly MappingDatabaseRowV1[]>;
  };
  $transaction<TValue>(
    work: (transaction: MappingDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function scopeForRow(row: MappingDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_SCOPE_INVALID');
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

function rowToDomain(row: MappingDatabaseRowV1): MappingDefinitionV1 {
  if (row.revision !== 1) throw new Error('DSM_PERSISTED_REVISION_INVALID');
  const parsed = createMappingDefinitionV1({
    datasetId: row.datasetId,
    versionId: row.id,
    tenantScope: scopeForRow(row),
    sourceSchemaVersionId: row.sourceSchemaVersionId,
    targetSchemaVersionId: row.targetSchemaVersionId,
    steps: row.steps,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    ...(row.publishedAt === null ? {} : { publishedAt: row.publishedAt.toISOString() }),
    canonicalHash: row.canonicalHash,
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_MAPPING_INVALID');
  return parsed.value;
}

function domainToRow(definition: MappingDefinitionV1): MappingDatabaseCreateDataV1 {
  return {
    ...databaseScope(definition.tenantScope),
    id: definition.versionId,
    datasetId: definition.datasetId,
    sourceSchemaVersionId: definition.sourceSchemaVersionId,
    targetSchemaVersionId: definition.targetSchemaVersionId,
    steps: definition.steps,
    status: definition.status,
    createdAt: new Date(definition.createdAt),
    publishedAt: definition.publishedAt === undefined ? null : new Date(definition.publishedAt),
    revision: 1,
    canonicalHash: definition.canonicalHash,
  };
}

function visible(context: TenantScopeV1, row: MappingDatabaseRowV1): boolean {
  const candidate = scopeForRow(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaMappingTransactionAdapter implements MappingTransactionPortV1 {
  public constructor(private readonly client: MappingDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, definition: MappingDefinitionV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, definition.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.mappingDefinitionRecord.findUnique({
      where: { id: definition.versionId },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToDomain(existing)) !== JSON.stringify(definition))
        throw new Error('DSM_IMMUTABLE_MAPPING');
      return;
    }
    await this.client.mappingDefinitionRecord.create({ data: domainToRow(definition) });
  }

  public async find(
    context: IamTenantContextV1,
    versionId: MappingDefinitionV1['versionId'],
  ): Promise<MappingDefinitionV1 | undefined> {
    const row = await this.client.mappingDefinitionRecord.findUnique({ where: { id: versionId } });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToDomain(row)
        : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    datasetId: MappingDefinitionV1['datasetId'],
  ): Promise<readonly MappingDefinitionV1[]> {
    const rows = await this.client.mappingDefinitionRecord.findMany({
      where: { datasetId, organizationId: context.tenantScope.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.filter((row) => visible(context.tenantScope, row)).map(rowToDomain);
  }
}

export class PrismaMappingRepositoryAdapter implements MappingRepositoryPortV1 {
  public constructor(private readonly client: MappingDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: MappingTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaMappingTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, definition: MappingDefinitionV1): Promise<void> {
    return new PrismaMappingTransactionAdapter(this.client).save(context, definition);
  }
  public find(
    context: IamTenantContextV1,
    versionId: MappingDefinitionV1['versionId'],
  ): Promise<MappingDefinitionV1 | undefined> {
    return new PrismaMappingTransactionAdapter(this.client).find(context, versionId);
  }
  public list(
    context: IamTenantContextV1,
    datasetId: MappingDefinitionV1['datasetId'],
  ): Promise<readonly MappingDefinitionV1[]> {
    return new PrismaMappingTransactionAdapter(this.client).list(context, datasetId);
  }
}
