import {
  createGovernedDatasetDefinitionV1,
  type GovernedDatasetDefinitionV1,
} from '@databreeze/domain/dataset-governance/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  GovernedDatasetRepositoryPortV1,
  GovernedDatasetTransactionPortV1,
} from '../application/governed-dataset-repository.port.js';

export interface GovernedDatasetDatabaseRowV1 {
  readonly id: string;
  readonly datasetId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly schemaVersion: number;
  readonly name: string;
  readonly fields: unknown;
  readonly status: string;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  readonly canonicalHash: string;
}

export interface GovernedDatasetDatabaseCreateDataV1 {
  readonly id: string;
  readonly datasetId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly schemaVersion: number;
  readonly name: string;
  readonly fields: unknown;
  readonly status: string;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  readonly revision: number;
  readonly canonicalHash: string;
}

export interface GovernedDatasetDatabaseDelegateV1 {
  create(input: {
    readonly data: GovernedDatasetDatabaseCreateDataV1;
  }): Promise<GovernedDatasetDatabaseRowV1>;
  findUnique(input: {
    readonly where: { readonly id: string };
  }): Promise<GovernedDatasetDatabaseRowV1 | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, string>>;
    readonly orderBy: { readonly createdAt: 'asc' };
  }): Promise<readonly GovernedDatasetDatabaseRowV1[]>;
}

export interface GovernedDatasetDatabaseClientV1 {
  readonly datasetDefinitionRecord: GovernedDatasetDatabaseDelegateV1;
  $transaction<TValue>(
    work: (transaction: GovernedDatasetDatabaseClientV1) => Promise<TValue>,
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

function domainScope(row: GovernedDatasetDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function rowToDomain(row: GovernedDatasetDatabaseRowV1): GovernedDatasetDefinitionV1 {
  const created = createGovernedDatasetDefinitionV1({
    datasetId: row.datasetId,
    versionId: row.id,
    tenantScope: domainScope(row),
    name: row.name,
    fields: row.fields,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    ...(row.publishedAt === null ? {} : { publishedAt: row.publishedAt.toISOString() }),
    canonicalHash: row.canonicalHash,
  });
  if (!created.accepted) throw new Error('DSM_PERSISTED_DEFINITION_INVALID');
  return created.value;
}

function domainToCreate(
  definition: GovernedDatasetDefinitionV1,
): GovernedDatasetDatabaseCreateDataV1 {
  const scope = databaseScope(definition.tenantScope);
  return {
    ...scope,
    id: definition.versionId,
    datasetId: definition.datasetId,
    schemaVersion: definition.schemaVersion,
    name: definition.name,
    fields: definition.fields,
    status: definition.status,
    createdAt: new Date(definition.createdAt),
    publishedAt: definition.publishedAt === undefined ? null : new Date(definition.publishedAt),
    revision: 1,
    canonicalHash: definition.canonicalHash,
  };
}

function visible(context: TenantScopeV1, row: GovernedDatasetDatabaseRowV1): boolean {
  const candidate = domainScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaGovernedDatasetTransactionAdapter implements GovernedDatasetTransactionPortV1 {
  public constructor(private readonly client: GovernedDatasetDatabaseClientV1) {}

  public async save(
    context: IamTenantContextV1,
    definition: GovernedDatasetDefinitionV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, definition.tenantScope)) {
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    }
    const existing = await this.client.datasetDefinitionRecord.findUnique({
      where: { id: definition.versionId },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToDomain(existing)) !== JSON.stringify(definition)) {
        throw new Error('DSM_IMMUTABLE_DEFINITION');
      }
      return;
    }
    await this.client.datasetDefinitionRecord.create({ data: domainToCreate(definition) });
  }

  public async find(
    context: IamTenantContextV1,
    versionId: GovernedDatasetDefinitionV1['versionId'],
  ): Promise<GovernedDatasetDefinitionV1 | undefined> {
    const row = await this.client.datasetDefinitionRecord.findUnique({ where: { id: versionId } });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToDomain(row)
        : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    datasetId: GovernedDatasetDefinitionV1['datasetId'],
  ): Promise<readonly GovernedDatasetDefinitionV1[]> {
    const rows = await this.client.datasetDefinitionRecord.findMany({
      where: { datasetId, organizationId: context.tenantScope.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.filter((row) => visible(context.tenantScope, row)).map(rowToDomain);
  }
}

export class PrismaGovernedDatasetRepositoryAdapter implements GovernedDatasetRepositoryPortV1 {
  public constructor(private readonly client: GovernedDatasetDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: GovernedDatasetTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaGovernedDatasetTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, definition: GovernedDatasetDefinitionV1): Promise<void> {
    return new PrismaGovernedDatasetTransactionAdapter(this.client).save(context, definition);
  }

  public find(
    context: IamTenantContextV1,
    versionId: GovernedDatasetDefinitionV1['versionId'],
  ): Promise<GovernedDatasetDefinitionV1 | undefined> {
    return new PrismaGovernedDatasetTransactionAdapter(this.client).find(context, versionId);
  }

  public list(
    context: IamTenantContextV1,
    datasetId: GovernedDatasetDefinitionV1['datasetId'],
  ): Promise<readonly GovernedDatasetDefinitionV1[]> {
    return new PrismaGovernedDatasetTransactionAdapter(this.client).list(context, datasetId);
  }
}
