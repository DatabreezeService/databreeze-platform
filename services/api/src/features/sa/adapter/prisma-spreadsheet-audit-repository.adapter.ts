import {
  createSpreadsheetAuditResultV1,
  type SpreadsheetAuditResultV1,
} from '@databreeze/domain/spreadsheet-audit/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  SpreadsheetAuditRepositoryPortV1,
  SpreadsheetAuditTransactionPortV1,
} from '../application/spreadsheet-audit-repository.port.js';

export interface SpreadsheetAuditDatabaseRowV1 {
  readonly id: string;
  readonly artifactVersionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly workbookSha256: string;
  readonly sheets: unknown;
  readonly findings: unknown;
  readonly blockedReasons: unknown;
  readonly processorVersion: string;
  readonly createdAt: Date;
}

export interface SpreadsheetAuditDatabaseCreateDataV1
  extends Omit<SpreadsheetAuditDatabaseRowV1, 'createdAt'> {
  readonly createdAt: Date;
}

export interface SpreadsheetAuditDatabaseClientV1 {
  readonly spreadsheetAuditResultRecord: {
    create(input: {
      readonly data: SpreadsheetAuditDatabaseCreateDataV1;
    }): Promise<SpreadsheetAuditDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<SpreadsheetAuditDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, string>>;
      readonly orderBy: { readonly id: 'asc' };
    }): Promise<readonly SpreadsheetAuditDatabaseRowV1[]>;
  };
  $transaction<TValue>(
    work: (transaction: SpreadsheetAuditDatabaseClientV1) => Promise<TValue>,
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

function rowScope(row: SpreadsheetAuditDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('SA_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function rowToDomain(row: SpreadsheetAuditDatabaseRowV1): SpreadsheetAuditResultV1 {
  const parsed = createSpreadsheetAuditResultV1({
    auditId: row.id,
    artifactVersionId: row.artifactVersionId,
    tenantScope: rowScope(row),
    workbookSha256: row.workbookSha256,
    sheets: row.sheets,
    findings: row.findings,
    blockedReasons: row.blockedReasons,
    processorVersion: row.processorVersion,
    createdAt: row.createdAt.toISOString(),
  });
  if (!parsed.accepted) throw new Error('SA_PERSISTED_AUDIT_RESULT_INVALID');
  return parsed.value;
}

function domainToCreate(result: SpreadsheetAuditResultV1): SpreadsheetAuditDatabaseCreateDataV1 {
  return {
    ...databaseScope(result.tenantScope),
    id: result.auditId,
    artifactVersionId: result.artifactVersionId,
    workbookSha256: result.workbookSha256,
    sheets: result.sheets,
    findings: result.findings,
    blockedReasons: result.blockedReasons,
    processorVersion: result.processorVersion,
    createdAt: new Date(result.createdAt),
  };
}

function visible(context: TenantScopeV1, row: SpreadsheetAuditDatabaseRowV1): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaSpreadsheetAuditTransactionAdapter implements SpreadsheetAuditTransactionPortV1 {
  public constructor(private readonly client: SpreadsheetAuditDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, result: SpreadsheetAuditResultV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, result.tenantScope))
      throw new Error('SA_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.spreadsheetAuditResultRecord.findUnique({
      where: { id: result.auditId },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToDomain(existing)) !== JSON.stringify(result))
        throw new Error('SA_IMMUTABLE_AUDIT_RESULT');
      return;
    }
    await this.client.spreadsheetAuditResultRecord.create({ data: domainToCreate(result) });
  }

  public async find(
    context: IamTenantContextV1,
    auditId: SpreadsheetAuditResultV1['auditId'],
  ): Promise<SpreadsheetAuditResultV1 | undefined> {
    const row = await this.client.spreadsheetAuditResultRecord.findUnique({
      where: { id: auditId },
    });
    return row !== null && visible(context.tenantScope, row) ? rowToDomain(row) : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    artifactVersionId: SpreadsheetAuditResultV1['artifactVersionId'],
  ): Promise<readonly SpreadsheetAuditResultV1[]> {
    const rows = await this.client.spreadsheetAuditResultRecord.findMany({
      where: { artifactVersionId, organizationId: context.tenantScope.organizationId },
      orderBy: { id: 'asc' },
    });
    return rows.filter((row) => visible(context.tenantScope, row)).map(rowToDomain);
  }
}

export class PrismaSpreadsheetAuditRepositoryAdapter implements SpreadsheetAuditRepositoryPortV1 {
  public constructor(private readonly client: SpreadsheetAuditDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: SpreadsheetAuditTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaSpreadsheetAuditTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, result: SpreadsheetAuditResultV1): Promise<void> {
    return new PrismaSpreadsheetAuditTransactionAdapter(this.client).save(context, result);
  }

  public find(
    context: IamTenantContextV1,
    auditId: SpreadsheetAuditResultV1['auditId'],
  ): Promise<SpreadsheetAuditResultV1 | undefined> {
    return new PrismaSpreadsheetAuditTransactionAdapter(this.client).find(context, auditId);
  }

  public list(
    context: IamTenantContextV1,
    artifactVersionId: SpreadsheetAuditResultV1['artifactVersionId'],
  ): Promise<readonly SpreadsheetAuditResultV1[]> {
    return new PrismaSpreadsheetAuditTransactionAdapter(this.client).list(
      context,
      artifactVersionId,
    );
  }
}
