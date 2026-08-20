import { tenantScopesEqualV1, type StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import {
  type CrfReportCreateDefinitionInputV1,
  type CrfReportDetailV1,
  type CrfReportListPageV1,
  type CrfReportListQueryV1,
  type CrfReportRepositoryPortV1,
  type CrfReportRunDetailV1,
  type CrfReportSummaryV1,
} from '../application/report-repository.port.js';

interface StoredDefinition extends CrfReportDetailV1 {
  readonly tenantScope: IamTenantContextV1['tenantScope'];
  readonly idempotencyKey: string;
  readonly canonicalHash: string;
}

function clone<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

function sameScope(context: IamTenantContextV1, scope: IamTenantContextV1['tenantScope']): boolean {
  return tenantScopesEqualV1(context.tenantScope, scope);
}

function encodeCursor(updatedAt: string, reportId: string): string {
  return Buffer.from(JSON.stringify({ updatedAt, reportId }), 'utf8').toString('base64url');
}

function decodeCursor(
  value: string | undefined,
): { updatedAt: string; reportId: string } | undefined {
  if (value === undefined || value.length < 16 || value.length > 512) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    return typeof decoded['updatedAt'] === 'string' && typeof decoded['reportId'] === 'string'
      ? { updatedAt: decoded['updatedAt'], reportId: decoded['reportId'] }
      : undefined;
  } catch {
    return undefined;
  }
}

export class InMemoryCrfReportRepositoryAdapter implements CrfReportRepositoryPortV1 {
  private readonly definitions = new Map<string, StoredDefinition>();
  private readonly runs = new Map<
    string,
    CrfReportRunDetailV1 & { readonly tenantScope: IamTenantContextV1['tenantScope'] }
  >();

  public list(
    context: IamTenantContextV1,
    query: CrfReportListQueryV1,
  ): Promise<CrfReportListPageV1> {
    const cursor = decodeCursor(query.cursor);
    const items = [...this.definitions.values()]
      .filter((definition) => sameScope(context, definition.tenantScope))
      .sort(
        (left, right) =>
          right['updatedAt'].localeCompare(left['updatedAt']) ||
          right['reportId'].localeCompare(left['reportId']),
      )
      .filter((definition) =>
        cursor === undefined
          ? true
          : definition.updatedAt < cursor.updatedAt ||
            (definition.updatedAt === cursor.updatedAt && definition.reportId < cursor.reportId),
      );
    const page = items.slice(0, query.limit).map((item) => this.summary(item));
    const last = items[query.limit - 1];
    return Promise.resolve(
      Object.freeze({
        items: Object.freeze(clone(page)),
        ...(last === undefined ? {} : { nextCursor: encodeCursor(last.updatedAt, last.reportId) }),
      }),
    );
  }

  public find(
    context: IamTenantContextV1,
    reportId: StableIdentifierV1,
  ): Promise<CrfReportDetailV1 | undefined> {
    const found = this.definitions.get(reportId);
    return Promise.resolve(
      found !== undefined && sameScope(context, found.tenantScope)
        ? clone(this.detail(found))
        : undefined,
    );
  }

  public findRun(
    context: IamTenantContextV1,
    reportId: StableIdentifierV1,
    runId: StableIdentifierV1,
  ): Promise<CrfReportRunDetailV1 | undefined> {
    const report = this.definitions.get(reportId);
    const run = this.runs.get(runId);
    return Promise.resolve(
      report !== undefined &&
        run !== undefined &&
        run.reportId === reportId &&
        sameScope(context, run.tenantScope)
        ? clone(run)
        : undefined,
    );
  }

  public createDefinition(
    context: IamTenantContextV1,
    input: CrfReportCreateDefinitionInputV1,
  ): Promise<CrfReportDetailV1> {
    const existing =
      [...this.definitions.values()].find(
        (candidate) =>
          sameScope(context, candidate.tenantScope) &&
          candidate.idempotencyKey === input.idempotencyKey,
      ) ?? this.definitions.get(input.reportId);
    if (existing !== undefined) {
      if (
        sameScope(context, existing.tenantScope) &&
        existing.canonicalHash === input.canonicalHash
      ) {
        return Promise.resolve(clone(this.detail(existing)));
      }
      throw new Error('CRF_REPORT_IDEMPOTENCY_CONFLICT');
    }
    const created: StoredDefinition = {
      schemaVersion: 4,
      reportId: input.reportId,
      name: input.name,
      clientId: input.clientId,
      period: input.period,
      datasetId: input.datasetId,
      datasetVersionId: input.datasetVersionId,
      status: 'DRAFT',
      reportVersion: 1,
      updatedAt: input.createdAt,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      supportedFormats: Object.freeze([...input.supportedFormats]),
      blockCount: input.blocks.length,
      tenantScope: clone(context.tenantScope),
      idempotencyKey: input.idempotencyKey,
      canonicalHash: input.canonicalHash,
    };
    this.definitions.set(input.reportId, created);
    return Promise.resolve(clone(this.detail(created)));
  }

  private summary(definition: StoredDefinition): CrfReportSummaryV1 {
    return {
      schemaVersion: 4,
      reportId: definition.reportId,
      name: definition.name,
      clientId: definition.clientId,
      period: definition.period,
      datasetId: definition.datasetId,
      datasetVersionId: definition.datasetVersionId,
      status: definition.status,
      reportVersion: definition.reportVersion,
      updatedAt: definition.updatedAt,
      ...(definition.latestRun === undefined
        ? {}
        : { latestRunStatus: definition.latestRun.status }),
    };
  }

  private detail(definition: StoredDefinition): CrfReportDetailV1 {
    return {
      ...this.summary(definition),
      templateId: definition.templateId,
      templateVersion: definition.templateVersion,
      supportedFormats: Object.freeze([...definition.supportedFormats]),
      blockCount: definition.blockCount,
      ...(definition.latestRun === undefined ? {} : { latestRun: clone(definition.latestRun) }),
    };
  }
}
