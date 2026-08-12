import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  SourceCatalogRecordV1,
  SourceCatalogRepositoryPortV1,
} from './source-catalog-repository.port.js';

export const SOURCE_CATALOG_SERVICE = Symbol('SOURCE_CATALOG_SERVICE');

export type SourceCatalogApplicationCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'NOT_FOUND'
  | 'UNAVAILABLE';

export type SourceCatalogApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: SourceCatalogApplicationCodeV1 };

export type SourceCatalogOriginalActionV1 = 'VIEW_SAFE' | 'OPEN_ON_SOURCE_DEVICE' | 'NONE';

export interface SourceCatalogEntryViewV1 {
  readonly sourceId: StableIdentifierV1;
  readonly safeDisplayLabel: string;
  readonly sourceType: SourceCatalogRecordV1['sourceType'];
  readonly versionId: StableIdentifierV1;
  readonly status: SourceCatalogRecordV1['status'];
  readonly health: SourceCatalogRecordV1['health'];
  readonly originalAction: SourceCatalogOriginalActionV1;
}

export interface SourceCatalogPageV1 {
  readonly entries: readonly SourceCatalogEntryViewV1[];
  readonly datasetId: StableIdentifierV1;
  readonly page: {
    readonly nextCursor?: string;
    readonly limit: number;
  };
  readonly generatedAt: string;
}

function accepted<TValue>(value: TValue): SourceCatalogApplicationResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: SourceCatalogApplicationCodeV1): SourceCatalogApplicationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function parseId(
  input: unknown,
):
  | { readonly accepted: true; readonly value: StableIdentifierV1 }
  | { readonly accepted: false; readonly code: 'INVALID_IDENTIFIER' } {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed : { accepted: false, code: 'INVALID_IDENTIFIER' };
}

function originalAction(record: SourceCatalogRecordV1): SourceCatalogOriginalActionV1 {
  if (record.dataMode === 'LOCAL') return 'OPEN_ON_SOURCE_DEVICE';
  if (record.status === 'RETIRED' || record.status === 'QUARANTINED') return 'NONE';
  return 'VIEW_SAFE';
}

function encodeCursor(record: SourceCatalogRecordV1): string {
  return Buffer.from(`${record.updatedAt}|${record.id}`, 'utf8').toString('base64url');
}

function decodeCursor(
  cursor: string | undefined,
): { readonly updatedAt: string; readonly id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separator = decoded.indexOf('|');
    if (separator <= 0) return undefined;
    return {
      updatedAt: decoded.slice(0, separator),
      id: decoded.slice(separator + 1),
    };
  } catch {
    return undefined;
  }
}

function toEntry(record: SourceCatalogRecordV1): SourceCatalogEntryViewV1 {
  return Object.freeze({
    sourceId: record.id,
    safeDisplayLabel: record.safeDisplayLabel,
    sourceType: record.sourceType,
    versionId: record.versionId,
    status: record.status,
    health: record.health,
    originalAction: originalAction(record),
  });
}

/** DDA-052: permission-filtered logical source catalog without Local path leakage. */
export class SourceCatalogService {
  public constructor(private readonly repository: SourceCatalogRepositoryPortV1) {}

  public async listDatasetSources(
    context: IamTenantContextV1,
    datasetIdInput: unknown,
    cursor?: string,
    limitInput = 50,
  ): Promise<SourceCatalogApplicationResultV1<SourceCatalogPageV1>> {
    if (context.tenantScope.scopeType !== 'workspace') return rejected('INVALID_SCOPE');
    const datasetId = parseId(datasetIdInput);
    if (!datasetId.accepted) return rejected(datasetId.code);
    const limit =
      typeof limitInput === 'number' && Number.isSafeInteger(limitInput) && limitInput > 0
        ? Math.min(limitInput, 100)
        : 50;
    try {
      const records = await this.repository.listByDataset(context, datasetId.value);
      if (records.length === 0) return rejected('NOT_FOUND');
      const ordered = [...records].sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
      );
      const decoded = decodeCursor(cursor);
      const start = decoded
        ? ordered.findIndex(
            (record) =>
              record.updatedAt < decoded.updatedAt ||
              (record.updatedAt === decoded.updatedAt && record.id > decoded.id),
          )
        : 0;
      if (decoded && start < 0) return rejected('NOT_FOUND');
      const pageRecords = ordered.slice(Math.max(start, 0), Math.max(start, 0) + limit);
      const last = pageRecords[pageRecords.length - 1];
      const hasMore = Math.max(start, 0) + limit < ordered.length;
      return accepted(
        Object.freeze({
          datasetId: datasetId.value,
          entries: Object.freeze(pageRecords.map((record) => toEntry(record))),
          page: Object.freeze({
            limit,
            ...(hasMore && last ? { nextCursor: encodeCursor(last) } : {}),
          }),
          generatedAt: new Date().toISOString(),
        }),
      );
    } catch {
      return rejected('UNAVAILABLE');
    }
  }

  public async findAuthorizedSource(
    context: IamTenantContextV1,
    sourceIdInput: unknown,
  ): Promise<SourceCatalogApplicationResultV1<SourceCatalogRecordV1>> {
    if (context.tenantScope.scopeType !== 'workspace') return rejected('INVALID_SCOPE');
    const sourceId = parseId(sourceIdInput);
    if (!sourceId.accepted) return rejected(sourceId.code);
    try {
      const record = await this.repository.findSource(context, sourceId.value);
      if (!record) return rejected('NOT_FOUND');
      return accepted(record);
    } catch {
      return rejected('UNAVAILABLE');
    }
  }
}
