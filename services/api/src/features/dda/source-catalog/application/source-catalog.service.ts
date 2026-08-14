import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import {
  UnavailableSourceCatalogAuthorizationAdapter,
  type SourceCatalogAuthorizationPortV1,
} from './source-catalog-authorization.port.js';
import type {
  SourceCatalogRecordV1,
  SourceCatalogRepositoryPortV1,
} from './source-catalog-repository.port.js';

export const SOURCE_CATALOG_SERVICE = Symbol('SOURCE_CATALOG_SERVICE');

export type SourceCatalogApplicationCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_CURSOR'
  | 'INVALID_LIMIT'
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

function decodeCursor(cursor: unknown):
  | {
      readonly accepted: true;
      readonly value?: { readonly updatedAt: string; readonly id: string };
    }
  | { readonly accepted: false; readonly code: 'INVALID_CURSOR' } {
  if (cursor === undefined) return { accepted: true };
  if (
    typeof cursor !== 'string' ||
    cursor.length === 0 ||
    cursor.length > 512 ||
    !/^[A-Za-z0-9_-]+$/u.test(cursor)
  ) {
    return { accepted: false, code: 'INVALID_CURSOR' };
  }
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    if (Buffer.from(decoded, 'utf8').toString('base64url') !== cursor) {
      return { accepted: false, code: 'INVALID_CURSOR' };
    }
    const separator = decoded.indexOf('|');
    if (separator <= 0 || separator !== decoded.lastIndexOf('|')) {
      return { accepted: false, code: 'INVALID_CURSOR' };
    }
    const updatedAt = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    const parsedTimestamp = parseStrictUtcTimestampV1(updatedAt);
    const parsedId = parseStableIdentifierV1(id);
    if (
      !parsedTimestamp.accepted ||
      !parsedId.accepted ||
      parsedTimestamp.value !== updatedAt ||
      parsedId.value !== id
    ) {
      return { accepted: false, code: 'INVALID_CURSOR' };
    }
    return {
      accepted: true,
      value: { updatedAt: parsedTimestamp.value, id: parsedId.value },
    };
  } catch {
    return { accepted: false, code: 'INVALID_CURSOR' };
  }
}

function parseLimit(
  input: unknown,
):
  | { readonly accepted: true; readonly value: number }
  | { readonly accepted: false; readonly code: 'INVALID_LIMIT' } {
  if (input === undefined) return { accepted: true, value: 50 };
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1 || input > 50) {
    return { accepted: false, code: 'INVALID_LIMIT' };
  }
  return { accepted: true, value: input };
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
  public constructor(
    private readonly repository: SourceCatalogRepositoryPortV1,
    private readonly authorization: SourceCatalogAuthorizationPortV1 = new UnavailableSourceCatalogAuthorizationAdapter(),
  ) {}

  public async listDatasetSources(
    context: IamTenantContextV1,
    datasetIdInput: unknown,
    cursor?: string,
    limitInput = 50,
  ): Promise<SourceCatalogApplicationResultV1<SourceCatalogPageV1>> {
    const datasetId = parseId(datasetIdInput);
    if (!datasetId.accepted) return rejected(datasetId.code);
    const parsedLimit = parseLimit(limitInput);
    if (!parsedLimit.accepted) return rejected(parsedLimit.code);
    const limit = parsedLimit.value;
    const decoded = decodeCursor(cursor);
    if (!decoded.accepted) return rejected(decoded.code);
    let decision: Awaited<ReturnType<SourceCatalogAuthorizationPortV1['authorize']>>;
    try {
      decision = await this.authorization.authorize(context, {
        action: 'READ_INDEX',
        datasetId: datasetId.value,
      });
    } catch {
      return rejected('UNAVAILABLE');
    }
    if (!decision.accepted) {
      return rejected(
        decision.code === 'AUTHORIZATION_UNAVAILABLE' || decision.code === 'UNAVAILABLE'
          ? 'UNAVAILABLE'
          : 'NOT_FOUND',
      );
    }
    try {
      const records = await this.repository.listByDataset(context, datasetId.value);
      if (records.length === 0) return rejected('NOT_FOUND');
      const ordered = [...records].sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
      );
      const cursorValue = decoded.value;
      const cursorIndex = cursorValue
        ? ordered.findIndex(
            (record) => record.updatedAt === cursorValue.updatedAt && record.id === cursorValue.id,
          )
        : -1;
      if (cursorValue && cursorIndex < 0) return rejected('NOT_FOUND');
      const start = cursorValue ? cursorIndex + 1 : 0;
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
    datasetIdInput: unknown,
    sourceIdInput: unknown,
  ): Promise<SourceCatalogApplicationResultV1<SourceCatalogRecordV1>> {
    const datasetId = parseId(datasetIdInput);
    const sourceId = parseId(sourceIdInput);
    if (!datasetId.accepted) return rejected(datasetId.code);
    if (!sourceId.accepted) return rejected(sourceId.code);
    let decision: Awaited<ReturnType<SourceCatalogAuthorizationPortV1['authorize']>>;
    try {
      decision = await this.authorization.authorize(context, {
        action: 'READ_VERSION',
        datasetId: datasetId.value,
        sourceId: sourceId.value,
      });
    } catch {
      return rejected('UNAVAILABLE');
    }
    if (!decision.accepted) {
      return rejected(
        decision.code === 'AUTHORIZATION_UNAVAILABLE' || decision.code === 'UNAVAILABLE'
          ? 'UNAVAILABLE'
          : 'NOT_FOUND',
      );
    }
    try {
      const record = await this.repository.findSource(context, sourceId.value);
      if (!record) return rejected('NOT_FOUND');
      if (record.dsmDatasetId !== datasetId.value) return rejected('NOT_FOUND');
      return accepted(record);
    } catch {
      return rejected('UNAVAILABLE');
    }
  }
}
