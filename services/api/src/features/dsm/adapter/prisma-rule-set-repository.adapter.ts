import {
  createRuleSetDefinitionV1,
  type RuleSetDefinitionV1,
} from '@databreeze/domain/rule-set/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  RuleSetRepositoryPortV1,
  RuleSetTransactionPortV1,
} from '../application/rule-set-repository.port.js';

export interface RuleSetDatabaseRowV1 {
  readonly id: string;
  readonly datasetId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly schemaVersionId: string;
  readonly rules: unknown;
  readonly status: string;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  readonly canonicalHash: string;
}

export interface RuleSetDatabaseCreateDataV1
  extends Omit<RuleSetDatabaseRowV1, 'createdAt' | 'publishedAt' | 'rules'> {
  readonly rules: unknown;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  readonly revision: number;
}

export interface RuleSetDatabaseClientV1 {
  readonly ruleSetDefinitionRecord: {
    create(input: { readonly data: RuleSetDatabaseCreateDataV1 }): Promise<RuleSetDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<RuleSetDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, string>>;
      readonly orderBy: { readonly createdAt: 'asc' };
    }): Promise<readonly RuleSetDatabaseRowV1[]>;
  };
  $transaction<TValue>(
    work: (transaction: RuleSetDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function rowScope(row: RuleSetDatabaseRowV1): TenantScopeV1 {
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

function rowToDomain(row: RuleSetDatabaseRowV1): RuleSetDefinitionV1 {
  const parsed = createRuleSetDefinitionV1({
    datasetId: row.datasetId,
    versionId: row.id,
    tenantScope: rowScope(row),
    schemaVersionId: row.schemaVersionId,
    rules: row.rules,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    ...(row.publishedAt === null ? {} : { publishedAt: row.publishedAt.toISOString() }),
    canonicalHash: row.canonicalHash,
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_RULE_SET_INVALID');
  return parsed.value;
}

function domainToRow(definition: RuleSetDefinitionV1): RuleSetDatabaseCreateDataV1 {
  return {
    ...databaseScope(definition.tenantScope),
    id: definition.versionId,
    datasetId: definition.datasetId,
    schemaVersionId: definition.schemaVersionId,
    rules: definition.rules,
    status: definition.status,
    createdAt: new Date(definition.createdAt),
    publishedAt: definition.publishedAt === undefined ? null : new Date(definition.publishedAt),
    revision: 1,
    canonicalHash: definition.canonicalHash,
  };
}

function visible(context: TenantScopeV1, row: RuleSetDatabaseRowV1): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaRuleSetTransactionAdapter implements RuleSetTransactionPortV1 {
  public constructor(private readonly client: RuleSetDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, definition: RuleSetDefinitionV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, definition.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.ruleSetDefinitionRecord.findUnique({
      where: { id: definition.versionId },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToDomain(existing)) !== JSON.stringify(definition))
        throw new Error('DSM_IMMUTABLE_RULE_SET');
      return;
    }
    await this.client.ruleSetDefinitionRecord.create({ data: domainToRow(definition) });
  }

  public async find(
    context: IamTenantContextV1,
    versionId: RuleSetDefinitionV1['versionId'],
  ): Promise<RuleSetDefinitionV1 | undefined> {
    const row = await this.client.ruleSetDefinitionRecord.findUnique({ where: { id: versionId } });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToDomain(row)
        : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    datasetId: RuleSetDefinitionV1['datasetId'],
  ): Promise<readonly RuleSetDefinitionV1[]> {
    const rows = await this.client.ruleSetDefinitionRecord.findMany({
      where: { datasetId, organizationId: context.tenantScope.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.filter((row) => visible(context.tenantScope, row)).map(rowToDomain);
  }
}

export class PrismaRuleSetRepositoryAdapter implements RuleSetRepositoryPortV1 {
  public constructor(private readonly client: RuleSetDatabaseClientV1) {}
  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: RuleSetTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaRuleSetTransactionAdapter(transaction)),
    );
  }
  public save(context: IamTenantContextV1, definition: RuleSetDefinitionV1): Promise<void> {
    return new PrismaRuleSetTransactionAdapter(this.client).save(context, definition);
  }
  public find(
    context: IamTenantContextV1,
    versionId: RuleSetDefinitionV1['versionId'],
  ): Promise<RuleSetDefinitionV1 | undefined> {
    return new PrismaRuleSetTransactionAdapter(this.client).find(context, versionId);
  }
  public list(
    context: IamTenantContextV1,
    datasetId: RuleSetDefinitionV1['datasetId'],
  ): Promise<readonly RuleSetDefinitionV1[]> {
    return new PrismaRuleSetTransactionAdapter(this.client).list(context, datasetId);
  }
}
