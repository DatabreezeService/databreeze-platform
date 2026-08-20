import type {
  DatasetCardV1,
  DatasetHealthV1,
  DatasetSourceFileV1,
  DatasetPreviewRowV1,
  GovernedFieldTypeV1,
} from './data-model.ts';
import { dataApiBaseConfiguration } from './data-api-config.ts';
export { dataApiBaseConfiguration } from './data-api-config.ts';
export type { DataApiBaseConfigurationV1 } from './data-api-config.ts';
import { dataImportApi, DataImportApiError, type DataImportRecordV1 } from './data-import-api.ts';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

type DataApiErrorCodeV1 =
  | 'DATASETS_UNAUTHORIZED'
  | 'DATASETS_UNAVAILABLE'
  | 'DATASETS_INVALID'
  | 'DATASETS_ABORTED'
  | 'SOURCES_INVALID'
  | 'SOURCES_UNAUTHORIZED'
  | 'SOURCES_UNAVAILABLE'
  | 'SOURCES_ABORTED';

export class DataApiError extends Error {
  public constructor(readonly code: DataApiErrorCodeV1) {
    super(code);
    this.name = 'DataApiError';
  }
}

export interface FetchAuthorizedDataIndexInputV1 {
  readonly baseUrl?: string;
  readonly locale: 'en' | 'vi-VN';
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

interface DatasetIndexEntryV1 {
  readonly datasetId: string;
  readonly versionId: string;
  readonly label: string;
  readonly status: 'PUBLISHED';
  readonly versionLabel: string;
  readonly publishedAt: string;
  readonly fieldCount: number;
  readonly fieldTypes: readonly GovernedFieldTypeV1[];
  readonly health: 'UNKNOWN';
  readonly readiness: 'READY';
}

interface DatasetIndexPageV1 {
  readonly datasets: readonly DatasetIndexEntryV1[];
  readonly nextCursor?: string;
}

interface SourceCatalogEntryV1 {
  readonly sourceId: string;
  readonly safeDisplayLabel: string;
  readonly sourceType: DatasetSourceFileV1['sourceType'];
  readonly versionId: string;
  readonly status: 'ACTIVE' | 'REVIEW' | 'QUARANTINED' | 'RETIRED';
  readonly health: 'HEALTHY' | 'WARNING' | 'BLOCKED' | 'UNKNOWN';
  readonly originalAction: DatasetSourceFileV1['originalAction'];
}

interface SourceCatalogPageV1 {
  readonly datasetId: string;
  readonly entries: readonly SourceCatalogEntryV1[];
}

const IDENTIFIER_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FIELD_TYPES = new Set<GovernedFieldTypeV1>(['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE']);
const SOURCE_TYPES = new Set<DatasetSourceFileV1['sourceType']>([
  'CSV',
  'XLSX',
  'IMAGE',
  'PDF',
  'RECEIPT',
  'TABLE',
]);
const SOURCE_STATUSES = new Set<SourceCatalogEntryV1['status']>([
  'ACTIVE',
  'REVIEW',
  'QUARANTINED',
  'RETIRED',
]);
const SOURCE_HEALTHS = new Set<SourceCatalogEntryV1['health']>([
  'HEALTHY',
  'WARNING',
  'BLOCKED',
  'UNKNOWN',
]);
const ORIGINAL_ACTIONS = new Set<DatasetSourceFileV1['originalAction']>([
  'VIEW_SAFE',
  'OPEN_ON_SOURCE_DEVICE',
  'NONE',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function safeText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    !/\p{Cc}/u.test(value)
  );
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function validLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 100;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/u, '')}${path}`;
}

function requestInit(signal?: AbortSignal): RequestInit {
  return {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    ...(signal === undefined ? {} : { signal }),
  };
}

function isAbort(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (isRecord(error) && error['name'] === 'AbortError')
  );
}

async function getJson(
  url: string,
  baseUrl: string,
  signal: AbortSignal | undefined,
  unauthorizedCode: 'DATASETS_UNAUTHORIZED' | 'SOURCES_UNAUTHORIZED',
  unavailableCode: 'DATASETS_UNAVAILABLE' | 'SOURCES_UNAVAILABLE',
  invalidCode: 'DATASETS_INVALID' | 'SOURCES_INVALID',
  abortedCode: 'DATASETS_ABORTED' | 'SOURCES_ABORTED',
): Promise<unknown> {
  const fetcher = createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher: globalThis.fetch.bind(globalThis),
  });
  let response: Response;
  try {
    response = await fetcher(url, requestInit(signal));
  } catch (error) {
    if (isAbort(error)) throw new DataApiError(abortedCode);
    throw new DataApiError(unavailableCode);
  }
  if (response.status === 401 || response.status === 403) {
    throw new DataApiError(unauthorizedCode);
  }
  if (!response.ok) throw new DataApiError(unavailableCode);
  try {
    return await response.json();
  } catch {
    throw new DataApiError(invalidCode);
  }
}

function parseDatasetIndex(value: unknown): DatasetIndexPageV1 {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['accepted', 'value']) ||
    value['accepted'] !== true
  ) {
    throw new DataApiError('DATASETS_INVALID');
  }
  const page = value['value'];
  if (!isRecord(page) || !hasOnlyKeys(page, ['datasets', 'page'])) {
    throw new DataApiError('DATASETS_INVALID');
  }
  const pageMeta = page['page'];
  if (
    !isRecord(pageMeta) ||
    !hasOnlyKeys(pageMeta, ['limit'], ['nextCursor']) ||
    !validLimit(pageMeta['limit']) ||
    (pageMeta['nextCursor'] !== undefined && !safeText(pageMeta['nextCursor'], 512))
  ) {
    throw new DataApiError('DATASETS_INVALID');
  }
  if (!Array.isArray(page['datasets']) || page['datasets'].length > pageMeta['limit']) {
    throw new DataApiError('DATASETS_INVALID');
  }
  const datasets = page['datasets'].map((candidate): DatasetIndexEntryV1 => {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, [
        'datasetId',
        'versionId',
        'label',
        'status',
        'versionLabel',
        'publishedAt',
        'fieldCount',
        'fieldTypes',
        'health',
        'readiness',
      ]) ||
      !identifier(candidate['datasetId']) ||
      !identifier(candidate['versionId']) ||
      !safeText(candidate['label'], 200) ||
      candidate['status'] !== 'PUBLISHED' ||
      !timestamp(candidate['versionLabel']) ||
      !timestamp(candidate['publishedAt']) ||
      candidate['versionLabel'] !== candidate['publishedAt'] ||
      typeof candidate['fieldCount'] !== 'number' ||
      !Number.isSafeInteger(candidate['fieldCount']) ||
      candidate['fieldCount'] < 1 ||
      candidate['fieldCount'] > 256 ||
      !Array.isArray(candidate['fieldTypes']) ||
      candidate['fieldTypes'].length !== candidate['fieldCount'] ||
      !candidate['fieldTypes'].every(
        (type) => typeof type === 'string' && FIELD_TYPES.has(type as GovernedFieldTypeV1),
      ) ||
      candidate['health'] !== 'UNKNOWN' ||
      candidate['readiness'] !== 'READY'
    ) {
      throw new DataApiError('DATASETS_INVALID');
    }
    return Object.freeze({
      datasetId: candidate['datasetId'],
      versionId: candidate['versionId'],
      label: candidate['label'],
      status: 'PUBLISHED',
      versionLabel: candidate['versionLabel'],
      publishedAt: candidate['publishedAt'],
      fieldCount: candidate['fieldCount'],
      fieldTypes: Object.freeze(candidate['fieldTypes'] as GovernedFieldTypeV1[]),
      health: 'UNKNOWN',
      readiness: 'READY',
    });
  });
  return Object.freeze({
    datasets: Object.freeze(datasets),
    ...(pageMeta['nextCursor'] === undefined ? {} : { nextCursor: pageMeta['nextCursor'] }),
  });
}

function parseSourceCatalog(value: unknown, datasetId: string): SourceCatalogPageV1 {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['accepted', 'value']) ||
    value['accepted'] !== true
  ) {
    throw new DataApiError('SOURCES_INVALID');
  }
  const page = value['value'];
  if (
    !isRecord(page) ||
    !hasOnlyKeys(page, ['datasetId', 'entries', 'page', 'generatedAt']) ||
    page['datasetId'] !== datasetId ||
    !timestamp(page['generatedAt']) ||
    !isRecord(page['page']) ||
    !hasOnlyKeys(page['page'], ['limit'], ['nextCursor']) ||
    !validLimit(page['page']['limit']) ||
    !Array.isArray(page['entries']) ||
    page['entries'].length > page['page']['limit']
  ) {
    throw new DataApiError('SOURCES_INVALID');
  }
  const entries = page['entries'].map((candidate): SourceCatalogEntryV1 => {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, [
        'sourceId',
        'safeDisplayLabel',
        'sourceType',
        'versionId',
        'status',
        'health',
        'originalAction',
      ]) ||
      !identifier(candidate['sourceId']) ||
      !safeText(candidate['safeDisplayLabel'], 255) ||
      typeof candidate['sourceType'] !== 'string' ||
      !SOURCE_TYPES.has(candidate['sourceType'] as DatasetSourceFileV1['sourceType']) ||
      !identifier(candidate['versionId']) ||
      typeof candidate['status'] !== 'string' ||
      !SOURCE_STATUSES.has(candidate['status'] as SourceCatalogEntryV1['status']) ||
      typeof candidate['health'] !== 'string' ||
      !SOURCE_HEALTHS.has(candidate['health'] as SourceCatalogEntryV1['health']) ||
      typeof candidate['originalAction'] !== 'string' ||
      !ORIGINAL_ACTIONS.has(candidate['originalAction'] as DatasetSourceFileV1['originalAction'])
    ) {
      throw new DataApiError('SOURCES_INVALID');
    }
    return Object.freeze({
      sourceId: candidate['sourceId'],
      safeDisplayLabel: candidate['safeDisplayLabel'],
      sourceType: candidate['sourceType'] as DatasetSourceFileV1['sourceType'],
      versionId: candidate['versionId'],
      status: candidate['status'] as SourceCatalogEntryV1['status'],
      health: candidate['health'] as SourceCatalogEntryV1['health'],
      originalAction: candidate['originalAction'] as DatasetSourceFileV1['originalAction'],
    });
  });
  return Object.freeze({ datasetId, entries: Object.freeze(entries) });
}

function datasetHealth(locale: 'en' | 'vi-VN'): DatasetHealthV1 {
  return Object.freeze({
    label: locale === 'vi-VN' ? 'Chưa có dữ liệu sức khỏe' : 'Health data unavailable',
    tone: 'UNKNOWN' as const,
  });
}

function sourceStatusLabel(status: SourceCatalogEntryV1['status'], locale: 'en' | 'vi-VN'): string {
  const labels = {
    'vi-VN': {
      ACTIVE: 'Đang hoạt động',
      REVIEW: 'Cần xem xét',
      QUARANTINED: 'Đã cách ly',
      RETIRED: 'Đã ngừng',
    },
    en: {
      ACTIVE: 'Active',
      REVIEW: 'Needs review',
      QUARANTINED: 'Quarantined',
      RETIRED: 'Retired',
    },
  } as const;
  return labels[locale][status];
}

function sourceHealthLabel(health: SourceCatalogEntryV1['health'], locale: 'en' | 'vi-VN'): string {
  const labels = {
    'vi-VN': {
      HEALTHY: 'Đã sẵn sàng',
      WARNING: 'Cần xem xét',
      BLOCKED: 'Đã chặn',
      UNKNOWN: 'Chưa có dữ liệu sức khỏe',
    },
    en: {
      HEALTHY: 'Healthy',
      WARNING: 'Needs review',
      BLOCKED: 'Blocked',
      UNKNOWN: 'Health data unavailable',
    },
  } as const;
  return labels[locale][health];
}

function toSourceFile(source: SourceCatalogEntryV1, locale: 'en' | 'vi-VN'): DatasetSourceFileV1 {
  return Object.freeze({
    sourceId: source.sourceId,
    label: source.safeDisplayLabel,
    sourceType: source.sourceType,
    statusLabel: sourceStatusLabel(source.status, locale),
    healthLabel: sourceHealthLabel(source.health, locale),
    originalAction: source.originalAction,
    evidenceAvailable: false,
  });
}

async function fetchSourcePage(
  baseUrl: string,
  datasetId: string,
  signal: AbortSignal | undefined,
): Promise<SourceCatalogPageV1> {
  const value = await getJson(
    endpoint(baseUrl, `/v1/dda/datasets/${encodeURIComponent(datasetId)}/sources?limit=5`),
    baseUrl,
    signal,
    'SOURCES_UNAUTHORIZED',
    'SOURCES_UNAVAILABLE',
    'SOURCES_INVALID',
    'SOURCES_ABORTED',
  );
  return parseSourceCatalog(value, datasetId);
}

export async function fetchAuthorizedDataIndexPage(
  input: FetchAuthorizedDataIndexInputV1,
): Promise<DatasetIndexPageV1> {
  const limit = input.limit ?? 25;
  if (!validLimit(limit)) throw new DataApiError('DATASETS_INVALID');
  const baseUrl = input.baseUrl ?? dataApiBaseConfiguration().baseUrl;
  const value = await getJson(
    endpoint(baseUrl, `/v1/datasets?limit=${encodeURIComponent(String(limit))}`),
    baseUrl,
    input.signal,
    'DATASETS_UNAUTHORIZED',
    'DATASETS_UNAVAILABLE',
    'DATASETS_INVALID',
    'DATASETS_ABORTED',
  );
  return parseDatasetIndex(value);
}

export async function fetchAuthorizedDataIndex(
  input: FetchAuthorizedDataIndexInputV1,
): Promise<readonly DatasetCardV1[]> {
  const page = await fetchAuthorizedDataIndexPage(input);
  let imports: readonly DataImportRecordV1[] = [];
  try {
    imports = await dataImportApi.list(50, input.baseUrl ?? dataApiBaseConfiguration().baseUrl);
  } catch (error) {
    if (error instanceof DataImportApiError && error.cause === 'network') {
      // The governed dataset index remains useful if the optional workflow
      // history endpoint is temporarily unavailable.
    } else if (error instanceof DataImportApiError && error.status === 401) {
      throw new DataApiError('DATASETS_UNAUTHORIZED');
    }
  }
  const approvedImports = new Map(
    imports
      .filter((record) => record.state === 'READY' && record.accepted !== undefined)
      .map((record) => [record.accepted?.datasetId, record] as const),
  );
  const datasets = await Promise.all(
    page.datasets.map(async (dataset): Promise<DatasetCardV1> => {
      let sources: readonly DatasetSourceFileV1[] = [];
      try {
        sources = (
          await fetchSourcePage(
            input.baseUrl ?? dataApiBaseConfiguration().baseUrl,
            dataset.datasetId,
            input.signal,
          )
        ).entries.map((source) => toSourceFile(source, input.locale));
      } catch (error) {
        if (error instanceof DataApiError && error.code === 'SOURCES_ABORTED') throw error;
        // The dataset index is authoritative. A denied or unavailable source page stays empty.
      }
      const approved = approvedImports.get(dataset.datasetId);
      const importSources =
        approved?.sources.map((source): DatasetSourceFileV1 => {
          const isXlsx = source.fileName.toLowerCase().endsWith('.xlsx');
          return Object.freeze({
            sourceId: source.artifactVersionId,
            label: source.fileName,
            sourceType: isXlsx ? ('XLSX' as const) : ('CSV' as const),
            statusLabel: input.locale === 'vi-VN' ? 'Đang hoạt động' : 'Active',
            healthLabel: input.locale === 'vi-VN' ? 'Đã kiểm tra' : 'Verified',
            originalAction: 'NONE' as const,
            evidenceAvailable: false,
          });
        }) ?? [];
      const mergedSources = sources.length > 0 ? sources : importSources;
      const sourceFields = approved?.sources.flatMap((source) => source.fields) ?? [];
      return Object.freeze({
        datasetId: dataset.datasetId,
        versionId: dataset.versionId,
        label: dataset.label,
        status: dataset.status,
        publishedAt: dataset.publishedAt,
        fieldCount: dataset.fieldCount,
        fieldTypes: dataset.fieldTypes,
        readiness: dataset.readiness,
        versionLabel: dataset.versionLabel,
        health:
          approved === undefined
            ? datasetHealth(input.locale)
            : Object.freeze({
                label: input.locale === 'vi-VN' ? 'Sẵn sàng phân tích' : 'Ready for analysis',
                tone: 'HEALTHY' as const,
              }),
        ...(approved === undefined
          ? {}
          : {
              rowCount: approved.review.counts.output,
              quality: approved.review.quality,
              fieldNames: Object.freeze(sourceFields.map((field) => field.name)),
              previewRows: Object.freeze(
                approved.sources
                  .flatMap((source) => source.sampleRows)
                  .slice(0, 100) as readonly DatasetPreviewRowV1[],
              ),
            }),
        sources: Object.freeze(mergedSources),
      });
    }),
  );
  return Object.freeze(datasets);
}
