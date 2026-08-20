import {
  tenantScopeContainsV1,
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  SourceCatalogRecordV1,
  SourceCatalogRepositoryPortV1,
  SourceCatalogSourceTypeV1,
  SourceCatalogStatusV1,
  SourceCatalogHealthV1,
} from '../application/source-catalog-repository.port.js';
import type { SourceCatalogRegistrationPortV1 } from '../application/source-catalog-registration.port.js';

const SOURCE_TYPES = new Set<SourceCatalogSourceTypeV1>([
  'CSV',
  'XLSX',
  'IMAGE',
  'PDF',
  'RECEIPT',
  'TABLE',
]);
const SOURCE_STATUSES = new Set<SourceCatalogStatusV1>([
  'ACTIVE',
  'REVIEW',
  'QUARANTINED',
  'RETIRED',
]);
const SOURCE_HEALTH = new Set<SourceCatalogHealthV1>(['HEALTHY', 'WARNING', 'BLOCKED', 'UNKNOWN']);
const SOURCE_DATA_MODES = new Set(['CLOUD', 'HYBRID', 'LOCAL'] as const);
const SOURCE_PREVIEW_KINDS = new Set([
  'CSV_SAFE_GRID',
  'XLSX_SAFE_GRID',
  'IMAGE',
  'PDF',
  'OPEN_ON_SOURCE_DEVICE',
] as const);

function isSafeDisplayLabel(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  const hasAbsoluteWindowsPath = /^[A-Za-z]:[\\/]/u.test(trimmed);
  const hasAbsoluteOrRelativePathPrefix =
    trimmed.startsWith('/') || trimmed.startsWith('\\') || /^(?:\.{1,2}|~)[\\/]/u.test(trimmed);
  const hasPathLikeSeparator = /(?:^|[^\s])[\\/](?=\S)/u.test(trimmed);
  return (
    trimmed.length > 0 &&
    trimmed.length <= 200 &&
    !/[\p{Cc}\p{Cf}]/u.test(trimmed) &&
    !hasAbsoluteWindowsPath &&
    !hasAbsoluteOrRelativePathPrefix &&
    !hasPathLikeSeparator &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(trimmed)
  );
}

export interface SourceCatalogDatabaseRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly dsmDatasetId: string;
  readonly iaeArtifactVersionId: string;
  readonly sourceType: unknown;
  readonly safeDisplayLabel: unknown;
  readonly status: unknown;
  readonly health: unknown;
  readonly dataMode: unknown;
  readonly previewKind?: unknown;
  readonly revision: unknown;
  readonly updatedAt: unknown;
}

export interface SourceCatalogAssignmentDatabaseRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly sourceId: string;
  readonly dsmDatasetId: string;
  readonly status: unknown;
}

interface SourceCatalogDelegateV1 {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: ReadonlyArray<Readonly<Record<string, 'asc' | 'desc'>>>;
  }): Promise<readonly SourceCatalogDatabaseRowV1[]>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<SourceCatalogDatabaseRowV1 | null>;
  create?(input: {
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<SourceCatalogDatabaseRowV1>;
}

interface SourceCatalogAssignmentDelegateV1 {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly SourceCatalogAssignmentDatabaseRowV1[]>;
  upsert?(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly create: Readonly<Record<string, unknown>>;
    readonly update: Readonly<Record<string, unknown>>;
  }): Promise<SourceCatalogAssignmentDatabaseRowV1>;
}

export interface SourceCatalogDatabaseClientV1 {
  readonly ddaDatasetSource: SourceCatalogDelegateV1;
  readonly ddaSourceAssignment: SourceCatalogAssignmentDelegateV1;
}

function recordFromRow(row: SourceCatalogDatabaseRowV1): SourceCatalogRecordV1 | undefined {
  const id = parseStableIdentifierV1(row.id);
  const organizationId = parseStableIdentifierV1(row.organizationId);
  const workspaceId = parseStableIdentifierV1(row.workspaceId);
  const dsmDatasetId = parseStableIdentifierV1(row.dsmDatasetId);
  const iaeArtifactVersionId = parseStableIdentifierV1(row.iaeArtifactVersionId);
  const updatedAtDate =
    row.updatedAt instanceof Date && Number.isFinite(row.updatedAt.getTime())
      ? row.updatedAt
      : undefined;
  const updatedAt =
    updatedAtDate === undefined
      ? { accepted: false as const, code: 'INVALID_UTC_TIMESTAMP' as const }
      : parseStrictUtcTimestampV1(updatedAtDate.toISOString());
  const sourceType = row.sourceType;
  const status = row.status;
  const health = row.health;
  const dataMode = row.dataMode;
  const previewKind = row.previewKind;
  if (
    !id.accepted ||
    !organizationId.accepted ||
    !workspaceId.accepted ||
    !dsmDatasetId.accepted ||
    !iaeArtifactVersionId.accepted ||
    !updatedAt.accepted ||
    typeof sourceType !== 'string' ||
    !SOURCE_TYPES.has(sourceType as SourceCatalogSourceTypeV1) ||
    typeof status !== 'string' ||
    !SOURCE_STATUSES.has(status as SourceCatalogStatusV1) ||
    typeof health !== 'string' ||
    !SOURCE_HEALTH.has(health as SourceCatalogHealthV1) ||
    typeof dataMode !== 'string' ||
    !SOURCE_DATA_MODES.has(dataMode as 'CLOUD' | 'HYBRID' | 'LOCAL') ||
    (previewKind !== undefined &&
      (typeof previewKind !== 'string' ||
        !SOURCE_PREVIEW_KINDS.has(
          previewKind as
            | 'CSV_SAFE_GRID'
            | 'XLSX_SAFE_GRID'
            | 'IMAGE'
            | 'PDF'
            | 'OPEN_ON_SOURCE_DEVICE',
        ))) ||
    !isSafeDisplayLabel(row.safeDisplayLabel) ||
    typeof row.revision !== 'number' ||
    !Number.isSafeInteger(row.revision) ||
    row.revision <= 0
  ) {
    return undefined;
  }
  const projectId = row.projectId === null ? undefined : parseStableIdentifierV1(row.projectId);
  if (row.projectId !== null && (!projectId || !projectId.accepted)) return undefined;
  return Object.freeze({
    id: id.value,
    organizationId: organizationId.value,
    workspaceId: workspaceId.value,
    ...(projectId && projectId.accepted ? { projectId: projectId.value } : {}),
    dsmDatasetId: dsmDatasetId.value,
    iaeArtifactVersionId: iaeArtifactVersionId.value,
    sourceType: sourceType as SourceCatalogSourceTypeV1,
    safeDisplayLabel: row.safeDisplayLabel,
    status: status as SourceCatalogStatusV1,
    health: health as SourceCatalogHealthV1,
    versionId: iaeArtifactVersionId.value,
    dataMode: dataMode as 'CLOUD' | 'HYBRID' | 'LOCAL',
    revision: row.revision,
    updatedAt: updatedAt.value,
    ...(previewKind === undefined
      ? {}
      : {
          previewKind: previewKind as
            | 'CSV_SAFE_GRID'
            | 'XLSX_SAFE_GRID'
            | 'IMAGE'
            | 'PDF'
            | 'OPEN_ON_SOURCE_DEVICE',
        }),
  });
}

function scopeFilter(context: IamTenantContextV1): Readonly<Record<string, unknown>> {
  const scope = context.tenantScope;
  if (scope.scopeType === 'organization') {
    return { organizationId: scope.organizationId };
  }
  if (scope.scopeType === 'workspace') {
    return {
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
    };
  }
  return {
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    OR: [{ projectId: scope.projectId }, { projectId: null }],
  };
}

function sourceScope(record: SourceCatalogRecordV1): TenantScopeV1 {
  return record.projectId === undefined
    ? {
        scopeType: 'workspace',
        organizationId: record.organizationId,
        workspaceId: record.workspaceId,
      }
    : {
        scopeType: 'project',
        organizationId: record.organizationId,
        workspaceId: record.workspaceId,
        projectId: record.projectId,
      };
}

function visible(context: IamTenantContextV1, record: SourceCatalogRecordV1): boolean {
  const recordScope = sourceScope(record);
  return (
    tenantScopeContainsV1(context.tenantScope, recordScope) ||
    tenantScopeContainsV1(recordScope, context.tenantScope)
  );
}

function assignmentScopeWhere(record: SourceCatalogRecordV1): Readonly<Record<string, unknown>> {
  return {
    organizationId: record.organizationId,
    workspaceId: record.workspaceId,
    sourceId: record.id,
    status: 'ACTIVE',
  };
}

function activeAssignmentMatches(
  assignments: readonly SourceCatalogAssignmentDatabaseRowV1[],
  record: SourceCatalogRecordV1,
): boolean {
  if (assignments.length !== 1) return false;
  const assignment = assignments[0];
  if (assignment === undefined || assignment.status !== 'ACTIVE') return false;
  return (
    assignment.organizationId === record.organizationId &&
    assignment.workspaceId === record.workspaceId &&
    (assignment.projectId ?? undefined) === record.projectId &&
    assignment.sourceId === record.id &&
    assignment.dsmDatasetId === record.dsmDatasetId
  );
}

/** Prisma adapter for DDA-052 dataset source catalog metadata. */
export class PrismaSourceCatalogRepositoryAdapter
  implements SourceCatalogRepositoryPortV1, SourceCatalogRegistrationPortV1
{
  public constructor(private readonly db: SourceCatalogDatabaseClientV1) {}

  public async register(
    context: IamTenantContextV1,
    record: SourceCatalogRecordV1,
  ): Promise<void> {
    if (
      context.tenantScope.scopeType !== 'workspace' ||
      record.organizationId !== context.tenantScope.organizationId ||
      record.workspaceId !== context.tenantScope.workspaceId ||
      record.projectId !== undefined
    ) {
      throw new Error('SOURCE_CATALOG_SCOPE_CONFLICT');
    }
    if (this.db.ddaDatasetSource.create === undefined || this.db.ddaSourceAssignment.upsert === undefined) {
      throw new Error('SOURCE_CATALOG_REGISTRATION_UNAVAILABLE');
    }
    const existing = await this.db.ddaDatasetSource.findFirst({ where: { id: record.id } });
    if (existing !== null) {
      if (
        existing.organizationId !== record.organizationId ||
        existing.workspaceId !== record.workspaceId ||
        existing.dsmDatasetId !== record.dsmDatasetId ||
        existing.iaeArtifactVersionId !== record.iaeArtifactVersionId
      ) {
        throw new Error('SOURCE_CATALOG_ID_CONFLICT');
      }
    } else {
      await this.db.ddaDatasetSource.create({
        data: {
          id: record.id,
          organizationId: record.organizationId,
          workspaceId: record.workspaceId,
          projectId: null,
          dsmDatasetId: record.dsmDatasetId,
          iaeArtifactVersionId: record.iaeArtifactVersionId,
          sourceType: record.sourceType,
          safeDisplayLabel: record.safeDisplayLabel,
          status: record.status,
          health: record.health,
          dataMode: record.dataMode,
          revision: record.revision,
          createdAt: new Date(record.updatedAt),
          updatedAt: new Date(record.updatedAt),
        },
      });
    }
    await this.db.ddaSourceAssignment.upsert({
      where: {
        organizationId_workspaceId_sourceId_dsmDatasetId: {
          organizationId: record.organizationId,
          workspaceId: record.workspaceId,
          sourceId: record.id,
          dsmDatasetId: record.dsmDatasetId,
        },
      },
      create: {
        id: record.id,
        organizationId: record.organizationId,
        workspaceId: record.workspaceId,
        projectId: null,
        sourceId: record.id,
        dsmDatasetId: record.dsmDatasetId,
        status: 'ACTIVE',
        createdAt: new Date(record.updatedAt),
        updatedAt: new Date(record.updatedAt),
      },
      update: {
        status: 'ACTIVE',
        updatedAt: new Date(record.updatedAt),
      },
    });
  }

  public async listByDataset(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly SourceCatalogRecordV1[]> {
    const filter = scopeFilter(context);
    const rows = await this.db.ddaDatasetSource.findMany({
      where: { ...filter, dsmDatasetId: datasetId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    const records = rows
      .map((row) => recordFromRow(row))
      .filter((record): record is SourceCatalogRecordV1 => record !== undefined)
      .filter((record) => record.dsmDatasetId === datasetId)
      .filter((record) => visible(context, record));
    const assigned = await Promise.all(
      records.map(async (record) => {
        const assignments = await this.db.ddaSourceAssignment.findMany({
          where: assignmentScopeWhere(record),
        });
        return activeAssignmentMatches(assignments, record) ? record : undefined;
      }),
    );
    return assigned.filter((record): record is SourceCatalogRecordV1 => record !== undefined);
  }

  public async findSource(
    context: IamTenantContextV1,
    sourceId: StableIdentifierV1,
  ): Promise<SourceCatalogRecordV1 | undefined> {
    const filter = scopeFilter(context);
    const row = await this.db.ddaDatasetSource.findFirst({
      where: { ...filter, id: sourceId },
    });
    if (!row) return undefined;
    const record = recordFromRow(row);
    if (!record) return undefined;
    if (!visible(context, record)) return undefined;
    const assignments = await this.db.ddaSourceAssignment.findMany({
      where: assignmentScopeWhere(record),
    });
    return activeAssignmentMatches(assignments, record) ? record : undefined;
  }
}
