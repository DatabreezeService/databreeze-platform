import {
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  DataImportRecordV1,
  DataImportRepositoryPortV1,
  DataImportStateV1,
} from '../application/data-import-repository.port.js';

interface DataImportRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly revision: number;
  readonly state: string;
  readonly destination: string;
  readonly datasetId: string | null;
  readonly datasetName: string;
  readonly idempotencyKey: string;
  readonly payloadFingerprint: string;
  readonly sourceDocument: unknown;
  readonly reviewDocument: unknown;
  readonly acceptedDocument: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DataImportDatabaseClientV1 {
  readonly dataImportRecord: {
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: Record<string, unknown>;
      readonly update: Record<string, unknown>;
    }): Promise<DataImportRowV1>;
    findFirst(input: { readonly where: Record<string, unknown> }): Promise<DataImportRowV1 | null>;
    findMany(input: {
      readonly where: Record<string, unknown>;
      readonly orderBy: Record<string, 'asc' | 'desc'>;
      readonly take: number;
    }): Promise<readonly DataImportRowV1[]>;
    updateMany(input: {
      readonly where: Record<string, unknown>;
      readonly data: Record<string, unknown>;
    }): Promise<{ readonly count: number }>;
  };
}

function scopeData(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function rowScope(row: DataImportRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('DDA_PERSISTED_DATA_IMPORT_SCOPE_INVALID');
  return parsed.value;
}

function rowRecord(row: DataImportRowV1): DataImportRecordV1 {
  const tenantScope = rowScope(row);
  if (!Array.isArray(row.sourceDocument) || typeof row.reviewDocument !== 'object') {
    throw new Error('DDA_PERSISTED_DATA_IMPORT_INVALID');
  }
  const accepted =
    row.acceptedDocument === null || row.acceptedDocument === undefined
      ? undefined
      : (row.acceptedDocument as DataImportRecordV1['accepted']);
  return Object.freeze({
    importId: row.id,
    tenantScope,
    revision: row.revision,
    state: row.state as DataImportStateV1,
    destination: row.destination as DataImportRecordV1['destination'],
    ...(row.datasetId === null ? {} : { datasetId: row.datasetId }),
    datasetName: row.datasetName,
    idempotencyKey: row.idempotencyKey,
    payloadFingerprint: row.payloadFingerprint,
    sources: Object.freeze(row.sourceDocument as DataImportRecordV1['sources']),
    review: Object.freeze(row.reviewDocument as DataImportRecordV1['review']),
    ...(accepted === undefined ? {} : { accepted: Object.freeze(accepted) }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function data(record: DataImportRecordV1) {
  const scope = scopeData(record.tenantScope);
  return {
    ...scope,
    id: record.importId,
    revision: record.revision,
    state: record.state,
    destination: record.destination,
    datasetId: record.datasetId ?? null,
    datasetName: record.datasetName,
    idempotencyKey: record.idempotencyKey,
    payloadFingerprint: record.payloadFingerprint,
    sourceDocument: record.sources,
    reviewDocument: record.review,
    acceptedDocument: record.accepted ?? null,
    createdAt: new Date(record.createdAt),
  } as const;
}

export class PrismaDataImportRepositoryAdapter implements DataImportRepositoryPortV1 {
  public constructor(private readonly client: DataImportDatabaseClientV1) {}

  public async save(
    record: DataImportRecordV1,
    expectedRevision?: number,
  ): Promise<DataImportRecordV1> {
    const value = data(record);
    if (expectedRevision !== undefined) {
      const current = await this.client.dataImportRecord.findFirst({
        where: { id: record.importId },
      });
      if (current === null || current.revision !== expectedRevision) {
        throw new Error('DDA_IMPORT_REVISION_CONFLICT');
      }
      const updated = await this.client.dataImportRecord.updateMany({
        where: { id: record.importId, revision: expectedRevision },
        data: value,
      });
      if (updated.count !== 1) throw new Error('DDA_IMPORT_REVISION_CONFLICT');
      const row = await this.client.dataImportRecord.findFirst({ where: { id: record.importId } });
      if (row === null) throw new Error('DDA_DATA_IMPORT_NOT_FOUND_AFTER_UPDATE');
      const persisted = rowRecord(row);
      if (!tenantScopesEqualV1(persisted.tenantScope, record.tenantScope)) {
        throw new Error('DDA_DATA_IMPORT_SCOPE_CONFLICT');
      }
      return persisted;
    }
    const row = await this.client.dataImportRecord.upsert({
      where: { id: record.importId },
      create: value,
      update: value,
    });
    const persisted = rowRecord(row);
    if (!tenantScopesEqualV1(persisted.tenantScope, record.tenantScope)) {
      throw new Error('DDA_DATA_IMPORT_SCOPE_CONFLICT');
    }
    return persisted;
  }

  public async findById(
    importId: string,
    tenantScope: TenantScopeV1,
  ): Promise<DataImportRecordV1 | undefined> {
    const row = await this.client.dataImportRecord.findFirst({ where: { id: importId } });
    if (row === null) return undefined;
    const record = rowRecord(row);
    return tenantScopesEqualV1(record.tenantScope, tenantScope) ? record : undefined;
  }

  public async list(
    tenantScope: TenantScopeV1,
    limit: number,
  ): Promise<readonly DataImportRecordV1[]> {
    const scope = scopeData(tenantScope);
    const rows = await this.client.dataImportRecord.findMany({
      where: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows
      .map(rowRecord)
      .filter((record) => tenantScopesEqualV1(record.tenantScope, tenantScope));
  }
}
