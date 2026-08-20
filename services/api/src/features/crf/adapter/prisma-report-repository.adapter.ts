import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import {
  type CrfReportCreateDefinitionInputV1,
  type CrfReportDetailV1,
  type CrfReportFormatV1,
  type CrfReportListPageV1,
  type CrfReportListQueryV1,
  type CrfReportOutputSummaryV1,
  type CrfReportRepositoryPortV1,
  type CrfReportRunDetailV1,
  type CrfReportRunStatusV1,
  type CrfReportRunSummaryV1,
  type CrfReportStatusV1,
  type CrfReportSummaryV1,
} from '../application/report-repository.port.js';

export interface CrfReportDefinitionDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly scopeKey: string;
  readonly clientId: string;
  readonly name: string;
  readonly period: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly templateId: string;
  readonly templateVersion: number;
  readonly supportedFormats: unknown;
  readonly blocks: unknown;
  readonly status: string;
  readonly reportVersion: number;
  readonly idempotencyKey: string;
  readonly canonicalHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CrfReportRunDatabaseRowV1 {
  readonly id: string;
  readonly definitionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly reportVersion: number;
  readonly status: string;
  readonly jraJobId: string | null;
  readonly resultManifestId: string | null;
  readonly createdAt: Date;
  readonly finishedAt: Date | null;
}

export interface CrfReportOutputDatabaseRowV1 {
  readonly format: string;
  readonly state: string;
  readonly failureCode: string | null;
}

export interface CrfReportEvidenceDatabaseRowV1 {
  readonly factId: string;
  readonly sourceId: string;
}

export interface CrfReportDatabaseClientV1 {
  readonly clientReportDefinitionRecord: {
    findMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy: readonly Readonly<Record<string, 'asc' | 'desc'>>[];
      readonly take: number;
    }): Promise<readonly CrfReportDefinitionDatabaseRowV1[]>;
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
    }): Promise<CrfReportDefinitionDatabaseRowV1 | null>;
    create(input: {
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<CrfReportDefinitionDatabaseRowV1>;
  };
  readonly clientReportRunRecord: {
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: readonly Readonly<Record<string, 'asc' | 'desc'>>[];
    }): Promise<CrfReportRunDatabaseRowV1 | null>;
  };
  readonly clientReportOutputRecord: {
    findMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: readonly Readonly<Record<string, 'asc' | 'desc'>>[];
    }): Promise<readonly CrfReportOutputDatabaseRowV1[]>;
  };
  readonly clientReportEvidenceRecord: {
    findMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
    }): Promise<readonly CrfReportEvidenceDatabaseRowV1[]>;
  };
}

const formats: readonly CrfReportFormatV1[] = ['DOCX', 'PPTX', 'XLSX', 'PDF', 'WEB'];
const statuses: readonly CrfReportStatusV1[] = [
  'DRAFT',
  'RUNNING',
  'REVIEW',
  'RELEASED',
  'WITHDRAWN',
  'BLOCKED',
];
const runStatuses: readonly CrfReportRunStatusV1[] = [
  'QUEUED',
  'RUNNING',
  'BLOCKED',
  'REVIEW',
  'RELEASED',
  'FAILED',
];

function scopeWhere(scope: TenantScopeV1): Record<string, unknown> {
  const where: Record<string, unknown> = {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  };
  return where;
}

function scopeKey(scope: TenantScopeV1): string {
  return [
    scope.scopeType,
    scope.organizationId,
    scope.scopeType === 'organization' ? '' : scope.workspaceId,
    scope.scopeType === 'project' ? scope.projectId : '',
  ].join(':');
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}

function rowScope(row: {
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
}): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('CRF_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function timestamp(value: Date | null, code: string): string | undefined {
  if (value === null) return undefined;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(code);
  const parsed = parseStrictUtcTimestampV1(value.toISOString());
  if (!parsed.accepted) throw new Error(code);
  return parsed.value;
}

function parseJsonArray(value: unknown, code: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error(code);
  return value;
}

function parseFormats(value: unknown): readonly CrfReportFormatV1[] {
  const values = parseJsonArray(value, 'CRF_PERSISTED_FORMATS_INVALID');
  if (
    values.length < 1 ||
    values.some((item) => typeof item !== 'string' || !formats.includes(item as CrfReportFormatV1))
  ) {
    throw new Error('CRF_PERSISTED_FORMATS_INVALID');
  }
  return Object.freeze(values as CrfReportFormatV1[]);
}

function parseId(value: string, code: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error(code);
  return parsed.value;
}

function parseStatus(value: string): CrfReportStatusV1 {
  if (!statuses.includes(value as CrfReportStatusV1))
    throw new Error('CRF_PERSISTED_STATUS_INVALID');
  return value as CrfReportStatusV1;
}

function parseRunStatus(value: string): CrfReportRunStatusV1 {
  if (!runStatuses.includes(value as CrfReportRunStatusV1))
    throw new Error('CRF_PERSISTED_RUN_STATUS_INVALID');
  return value as CrfReportRunStatusV1;
}

function cursorValue(updatedAt: string, reportId: string): string {
  return Buffer.from(JSON.stringify({ updatedAt, reportId }), 'utf8').toString('base64url');
}

function decodeCursor(
  value: string | undefined,
): { readonly updatedAt: Date; readonly reportId: StableIdentifierV1 } | undefined {
  if (value === undefined) return undefined;
  if (!/^[A-Za-z0-9_-]{16,512}$/u.test(value)) throw new Error('CRF_CURSOR_INVALID');
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new Error('CRF_CURSOR_INVALID');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('CRF_CURSOR_INVALID');
  const record = raw as Record<string, unknown>;
  const id = parseStableIdentifierV1(record['reportId']);
  const time = parseStrictUtcTimestampV1(record['updatedAt']);
  if (!id.accepted || !time.accepted) throw new Error('CRF_CURSOR_INVALID');
  return { updatedAt: new Date(time.value), reportId: id.value };
}

function definitionEntry(
  row: CrfReportDefinitionDatabaseRowV1,
  latestRun?: CrfReportRunDatabaseRowV1,
): CrfReportSummaryV1 {
  const reportId = parseId(row.id, 'CRF_PERSISTED_DEFINITION_INVALID');
  const clientId = parseId(row.clientId, 'CRF_PERSISTED_DEFINITION_INVALID');
  const datasetId = parseId(row.datasetId, 'CRF_PERSISTED_DEFINITION_INVALID');
  const datasetVersionId = parseId(row.datasetVersionId, 'CRF_PERSISTED_DEFINITION_INVALID');
  const createdAt = timestamp(row.updatedAt, 'CRF_PERSISTED_DEFINITION_INVALID');
  if (
    createdAt === undefined ||
    row.name.length < 1 ||
    row.name.length > 200 ||
    row.period.length < 1 ||
    row.period.length > 64 ||
    !Number.isSafeInteger(row.reportVersion) ||
    row.reportVersion < 1
  )
    throw new Error('CRF_PERSISTED_DEFINITION_INVALID');
  return Object.freeze({
    schemaVersion: 4,
    reportId,
    name: row.name,
    clientId,
    period: row.period,
    datasetId,
    datasetVersionId,
    status: parseStatus(row.status),
    reportVersion: row.reportVersion,
    updatedAt: createdAt,
    ...(latestRun === undefined ? {} : { latestRunStatus: parseRunStatus(latestRun.status) }),
  });
}

function runSummary(row: CrfReportRunDatabaseRowV1): CrfReportRunSummaryV1 {
  const runId = parseId(row.id, 'CRF_PERSISTED_RUN_INVALID');
  const createdAt = timestamp(row.createdAt, 'CRF_PERSISTED_RUN_INVALID');
  const finishedAt = timestamp(row.finishedAt, 'CRF_PERSISTED_RUN_INVALID');
  if (createdAt === undefined || !Number.isSafeInteger(row.reportVersion) || row.reportVersion < 1)
    throw new Error('CRF_PERSISTED_RUN_INVALID');
  return Object.freeze({
    runId,
    reportVersion: row.reportVersion,
    status: parseRunStatus(row.status),
    createdAt,
    ...(finishedAt === undefined ? {} : { finishedAt }),
  });
}

export class PrismaCrfReportRepositoryAdapter implements CrfReportRepositoryPortV1 {
  public constructor(private readonly client: CrfReportDatabaseClientV1) {}

  public async list(
    context: IamTenantContextV1,
    query: CrfReportListQueryV1,
  ): Promise<CrfReportListPageV1> {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 50)
      throw new Error('CRF_LIMIT_INVALID');
    const cursor = decodeCursor(query.cursor);
    const where: Record<string, unknown> = {
      ...scopeWhere(context.tenantScope),
      scopeKey: scopeKey(context.tenantScope),
    };
    if (cursor !== undefined) {
      where['OR'] = [
        { updatedAt: { lt: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, id: { lt: cursor.reportId } },
      ];
    }
    const rows = await this.client.clientReportDefinitionRecord.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const entries = await Promise.all(
      rows.map(async (row) => {
        const scope = rowScope(row);
        if (!tenantScopesEqualV1(scope, context.tenantScope)) throw new Error('CRF_SCOPE_MISMATCH');
        const run = await this.client.clientReportRunRecord.findFirst({
          where: { definitionId: row.id, ...scopeWhere(context.tenantScope) },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        return definitionEntry(row, run ?? undefined);
      }),
    );
    const items = entries.slice(0, query.limit);
    const last = items[items.length - 1];
    return Object.freeze({
      items: Object.freeze(items),
      ...(entries.length > query.limit && last !== undefined
        ? { nextCursor: cursorValue(last.updatedAt, last.reportId) }
        : {}),
    });
  }

  public async find(
    context: IamTenantContextV1,
    reportId: StableIdentifierV1,
  ): Promise<CrfReportDetailV1 | undefined> {
    const row = await this.client.clientReportDefinitionRecord.findFirst({
      where: {
        id: reportId,
        ...scopeWhere(context.tenantScope),
        scopeKey: scopeKey(context.tenantScope),
      },
    });
    if (row === null) return undefined;
    const scope = rowScope(row);
    if (!tenantScopesEqualV1(scope, context.tenantScope)) throw new Error('CRF_SCOPE_MISMATCH');
    const run = await this.client.clientReportRunRecord.findFirst({
      where: { definitionId: row.id, ...scopeWhere(context.tenantScope) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const summary = definitionEntry(row, run ?? undefined);
    const templateId = parseId(row.templateId, 'CRF_PERSISTED_DEFINITION_INVALID');
    if (!Number.isSafeInteger(row.templateVersion) || row.templateVersion < 1)
      throw new Error('CRF_PERSISTED_DEFINITION_INVALID');
    const blocks = parseJsonArray(row.blocks, 'CRF_PERSISTED_BLOCKS_INVALID');
    return Object.freeze({
      ...summary,
      templateId,
      templateVersion: row.templateVersion,
      supportedFormats: parseFormats(row.supportedFormats),
      blockCount: blocks.length,
      ...(run === null ? {} : { latestRun: runSummary(run) }),
    });
  }

  public async findRun(
    context: IamTenantContextV1,
    reportId: StableIdentifierV1,
    runId: StableIdentifierV1,
  ): Promise<CrfReportRunDetailV1 | undefined> {
    const report = await this.client.clientReportDefinitionRecord.findFirst({
      where: {
        id: reportId,
        ...scopeWhere(context.tenantScope),
        scopeKey: scopeKey(context.tenantScope),
      },
    });
    if (report === null) return undefined;
    const row = await this.client.clientReportRunRecord.findFirst({
      where: { id: runId, definitionId: reportId, ...scopeWhere(context.tenantScope) },
    });
    if (row === null) return undefined;
    const scope = rowScope(row);
    if (!tenantScopesEqualV1(scope, context.tenantScope)) throw new Error('CRF_SCOPE_MISMATCH');
    const summary = runSummary(row);
    const outputRows = await this.client.clientReportOutputRecord.findMany({
      where: { runId, ...scopeWhere(context.tenantScope) },
      orderBy: [{ format: 'asc' }],
    });
    const outputs: CrfReportOutputSummaryV1[] = outputRows.map((output) => {
      if (
        !formats.includes(output.format as CrfReportFormatV1) ||
        !['PENDING', 'READY', 'FAILED', 'WITHDRAWN'].includes(output.state)
      )
        throw new Error('CRF_PERSISTED_OUTPUT_INVALID');
      return Object.freeze({
        format: output.format as CrfReportFormatV1,
        state: output.state as CrfReportOutputSummaryV1['state'],
        ...(output.failureCode === null ? {} : { failureCode: output.failureCode }),
      });
    });
    const evidenceRows = await this.client.clientReportEvidenceRecord.findMany({
      where: { runId, ...scopeWhere(context.tenantScope) },
    });
    if (
      evidenceRows.some(
        (evidence) =>
          !parseStableIdentifierV1(evidence.sourceId).accepted ||
          evidence.factId.length < 1 ||
          evidence.factId.length > 128,
      )
    )
      throw new Error('CRF_PERSISTED_EVIDENCE_INVALID');
    return Object.freeze({
      ...summary,
      reportId,
      frozen: true,
      jraBound: row.jraJobId !== null && row.resultManifestId !== null,
      outputs: Object.freeze(outputs),
      evidence: Object.freeze({
        factCount: new Set(evidenceRows.map((item) => item.factId)).size,
        referenceCount: evidenceRows.length,
        complete: evidenceRows.length > 0,
      }),
    });
  }

  public async createDefinition(
    context: IamTenantContextV1,
    input: CrfReportCreateDefinitionInputV1,
  ): Promise<CrfReportDetailV1> {
    const createdAt = new Date(input.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error('CRF_CREATED_AT_INVALID');
    const existing = await this.client.clientReportDefinitionRecord.findFirst({
      where: { scopeKey: scopeKey(context.tenantScope), idempotencyKey: input.idempotencyKey },
    });
    if (existing !== null) {
      if (existing.canonicalHash !== input.canonicalHash)
        throw new Error('CRF_REPORT_IDEMPOTENCY_CONFLICT');
      const replay = await this.find(
        context,
        parseId(existing.id, 'CRF_PERSISTED_DEFINITION_INVALID'),
      );
      if (replay === undefined) throw new Error('CRF_CREATED_ROW_NOT_VISIBLE');
      return replay;
    }
    let row: CrfReportDefinitionDatabaseRowV1;
    try {
      row = await this.client.clientReportDefinitionRecord.create({
        data: {
          id: input.reportId,
          scopeType: context.tenantScope.scopeType,
          organizationId: context.tenantScope.organizationId,
          workspaceId:
            context.tenantScope.scopeType === 'organization'
              ? null
              : context.tenantScope.workspaceId,
          projectId:
            context.tenantScope.scopeType === 'project' ? context.tenantScope.projectId : null,
          scopeKey: scopeKey(context.tenantScope),
          clientId: input.clientId,
          name: input.name,
          period: input.period,
          datasetId: input.datasetId,
          datasetVersionId: input.datasetVersionId,
          templateId: input.templateId,
          templateVersion: input.templateVersion,
          supportedFormats: input.supportedFormats,
          blocks: input.blocks,
          status: 'DRAFT',
          reportVersion: 1,
          idempotencyKey: input.idempotencyKey,
          canonicalHash: input.canonicalHash,
          createdAt,
          updatedAt: createdAt,
        },
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const raced = await this.client.clientReportDefinitionRecord.findFirst({
        where: { scopeKey: scopeKey(context.tenantScope), idempotencyKey: input.idempotencyKey },
      });
      if (raced === null || raced.canonicalHash !== input.canonicalHash)
        throw new Error('CRF_REPORT_IDEMPOTENCY_CONFLICT');
      const replay = await this.find(
        context,
        parseId(raced.id, 'CRF_PERSISTED_DEFINITION_INVALID'),
      );
      if (replay === undefined) throw new Error('CRF_CREATED_ROW_NOT_VISIBLE');
      return replay;
    }
    const result = await this.find(context, parseId(row.id, 'CRF_PERSISTED_DEFINITION_INVALID'));
    if (result === undefined) throw new Error('CRF_CREATED_ROW_NOT_VISIBLE');
    return result;
  }
}
