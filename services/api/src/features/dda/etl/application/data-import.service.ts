import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

import {
  createDatasetVersionManifestV1,
  createGovernedDatasetDefinitionV1,
  publishGovernedDatasetDefinitionV1,
  type GovernedDatasetDefinitionV1,
  type GovernedDatasetFieldV1,
} from '@databreeze/domain/dataset-governance/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { DdaIaePortV1 } from '../../application/foundation-ports.js';
import type { ArtifactRepositoryPortV1 } from '../../../iae/application/artifact-repository.port.js';
import { ArtifactIntakeService } from '../../../iae/application/artifact-intake.service.js';
import type { ArtifactIntakeRepositoryPortV1 } from '../../../iae/application/artifact-intake-repository.port.js';
import type { DatasetVersionRepositoryPortV1 } from '../../../dsm/application/dataset-version-repository.port.js';
import type { GovernedDatasetRepositoryPortV1 } from '../../../dsm/application/governed-dataset-repository.port.js';
import { DDA_WEB_INTAKE_PROFILE_V1 } from '../../intake/application/intake-profile.port.js';
import {
  decodeCsvTextV1,
  WebIntakeServiceV1,
} from '../../intake/application/web-intake.service.js';
import type { SourceCatalogRegistrationPortV1 } from '../../source-catalog/application/source-catalog-registration.port.js';
import type {
  SourceCatalogDataModeV1,
  SourceCatalogRecordV1,
  SourceCatalogSourceTypeV1,
} from '../../source-catalog/application/source-catalog-repository.port.js';

import type {
  DataImportCorrectionV1,
  DataImportDestinationV1,
  DataImportFieldV1,
  DataImportRecordV1,
  DataImportRepositoryPortV1,
  DataImportReviewV1,
  DataImportSourceV1,
} from './data-import-repository.port.js';
import { MappingAssistanceServiceV1 } from './mapping-assistance.service.js';
import type {
  MappingAssistanceErrorCodeV1,
  MappingAssistanceRequestV1,
  MappingAssistanceSuggestionV1,
} from './mapping-assistance.port.js';

export type DataImportProblemCodeV1 =
  | 'DDA_IMPORT_NOT_FOUND'
  | 'DDA_IMPORT_INVALID'
  | 'DDA_IMPORT_CONFLICT'
  | 'DDA_IMPORT_UNAVAILABLE'
  | 'DDA_IMPORT_UNAUTHORIZED'
  | 'DDA_IMPORT_REVIEW_REQUIRED'
  | 'DDA_IMPORT_REVISION_CONFLICT'
  | 'DDA_IMPORT_DATASET_UNAVAILABLE'
  | 'DDA_IMPORT_ARTIFACT_UNAVAILABLE'
  | 'DDA_INTAKE_LIMIT_SIZE'
  | 'DDA_INTAKE_LIMIT_ROWS'
  | 'DDA_INTAKE_LIMIT_COLUMNS'
  | 'DDA_INTAKE_MALFORMED_ENCODING'
  | 'DDA_INTAKE_UNSUPPORTED_ENCODING'
  | MappingAssistanceErrorCodeV1;

export type DataImportDeclaredEncodingV1 = 'utf-8' | 'utf-8-sig' | 'windows-1258';

export interface DataImportMappingSuggestionsV1 {
  readonly importId: string;
  readonly revision: number;
  readonly suggestions: readonly MappingAssistanceSuggestionV1[];
  readonly adapterUsed: boolean;
  readonly authoritative: false;
  readonly generatedAt: string;
}

export interface DataImportDashboardPreviewV1 {
  readonly importId: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly datasetName: string;
  readonly sourceCount: number;
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly sourceHashes: readonly string[];
  readonly columns: readonly {
    readonly name: string;
    readonly type: DataImportFieldV1['type'];
    readonly nullable: boolean;
  }[];
  readonly measure?: {
    readonly field: string;
    readonly sum: number;
    readonly average: number;
    readonly minimum: number;
    readonly maximum: number;
  };
  readonly dimension?: {
    readonly field: string;
    readonly groups: readonly {
      readonly label: string;
      readonly count: number;
      readonly total?: number;
    }[];
  };
  readonly sampleRows: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly generatedAt: string;
}

export type DataImportResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue; readonly replayed?: boolean }
  | { readonly accepted: false; readonly code: DataImportProblemCodeV1 };

export interface DataImportCreateFileInputV1 {
  readonly fileName: string;
  readonly claimedMediaType: string;
  readonly bytes: Uint8Array;
  readonly declaredEncoding?: DataImportDeclaredEncodingV1;
}

export interface DataImportCreateInputV1 {
  readonly context: IamTenantContextV1;
  readonly destination: DataImportDestinationV1;
  readonly datasetId?: string;
  readonly datasetName: string;
  readonly idempotencyKey: string;
  readonly files: readonly DataImportCreateFileInputV1[];
}

export interface DataImportCreateValueV1 {
  readonly importId: string;
  readonly revision: number;
  readonly state: DataImportRecordV1['state'];
  /**
   * The create response is intentionally a public projection (it never
   * includes tenant authority or the persisted fingerprint), but it must be
   * complete enough for the browser to continue the durable review state
   * machine and issue a correction/approval command.
   */
  readonly destination: DataImportRecordV1['destination'];
  readonly datasetId?: string;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sources: readonly DataImportSourceV1[];
  readonly review: DataImportReviewV1;
  readonly datasetName: string;
}

/**
 * Public import read model.  Tenant scope and the payload fingerprint are
 * repository integrity fields, not browser data.  Keeping this projection
 * separate from DataImportRecordV1 makes it difficult for a controller to
 * accidentally serialize internal authority or replay material.
 */
export type DataImportPublicRecordV1 = Omit<
  DataImportRecordV1,
  'tenantScope' | 'payloadFingerprint'
>;

function rejected<TValue>(code: DataImportProblemCodeV1): DataImportResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('DDA_IMPORT_CANONICAL_INVALID');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value !== 'object') throw new Error('DDA_IMPORT_CANONICAL_INVALID');
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Stable UUIDv4-shaped identifier derived from an idempotency/fingerprint key. */
function stableUuid(value: string): string {
  const bytes = Buffer.from(sha256(value), 'hex').subarray(0, 16);
  bytes[6] = (bytes[6] ?? 0) & 0x0f;
  bytes[6] = (bytes[6] ?? 0) | 0x40;
  bytes[8] = (bytes[8] ?? 0) & 0x3f;
  bytes[8] = (bytes[8] ?? 0) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function persistedIdentifier(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('DDA_IMPORT_PERSISTED_IDENTIFIER_INVALID');
  return parsed.value;
}

function sourceType(fileName: string, mediaType: string): SourceCatalogSourceTypeV1 {
  const lowerName = fileName.toLowerCase();
  if (mediaType.includes('spreadsheet') || lowerName.endsWith('.xlsx')) return 'XLSX';
  if (mediaType === 'text/csv' || lowerName.endsWith('.csv')) return 'CSV';
  return 'TABLE';
}

function safeDisplayLabel(fileName: string): string {
  const basename = fileName.replaceAll('\\', '/').split('/').pop()?.trim();
  return basename && basename.length > 0 ? basename.slice(0, 200) : 'Uploaded data';
}

function sourceDataMode(mode: 'Local' | 'Hybrid' | 'Cloud'): SourceCatalogDataModeV1 {
  return mode.toUpperCase() as SourceCatalogDataModeV1;
}

function now(): string {
  return new Date().toISOString();
}

function safeText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= max && !/\p{Cc}/u.test(value)
  );
}

/**
 * Parse the bounded number formats commonly found in exported finance sheets.
 * We deliberately accept only unambiguous grouping/decimal forms; arbitrary
 * text is kept as TEXT so the preview never invents a measure.
 */
function parseNumericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  let normalized = value.trim();
  if (normalized.length === 0) return undefined;
  let negative = false;
  if (normalized.startsWith('(') && normalized.endsWith(')')) {
    negative = true;
    normalized = normalized.slice(1, -1).trim();
  }
  normalized = normalized
    .replace(/[\u00a0\u202f\s]/gu, '')
    .replace(/^[\p{Sc}%]+/u, '')
    .replace(/[\p{Sc}%]+$/u, '');
  if (normalized.startsWith('-')) {
    negative = !negative;
    normalized = normalized.slice(1);
  } else if (normalized.startsWith('+')) {
    normalized = normalized.slice(1);
  }
  if (normalized.length === 0) return undefined;
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(normalized)) {
    normalized = normalized.replaceAll(',', '');
  } else if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/u.test(normalized)) {
    normalized = normalized.replaceAll('.', '').replace(',', '.');
  } else if (/^\d+,\d{1,2}$/u.test(normalized)) {
    normalized = normalized.replace(',', '.');
  } else if (!/^\d+(?:\.\d+)?$/u.test(normalized)) {
    return undefined;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -parsed : parsed;
}

function inferType(values: readonly unknown[]): DataImportFieldV1['type'] {
  const present = values.filter((value) => value !== null && value !== undefined && value !== '');
  if (present.length === 0) return 'TEXT';
  if (present.every((value) => typeof value === 'boolean' || value === 'true' || value === 'false'))
    return 'BOOLEAN';
  const numericValues = present.map(parseNumericValue);
  if (numericValues.every((value): value is number => value !== undefined)) {
    if (numericValues.every((value) => Number.isInteger(value))) return 'INTEGER';
    return 'DECIMAL';
  }
  if (
    present.every(
      (value) =>
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/u.test(value),
    )
  )
    return 'DATE';
  return 'TEXT';
}

function parseCsv(
  text: string,
  maximumDataRows?: number,
): {
  readonly headers: readonly string[];
  readonly rows: readonly string[][];
  readonly sourceHasMore: boolean;
} {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let reachedSentinelRow = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
        if (maximumDataRows !== undefined && rows.length === maximumDataRows + 2) {
          reachedSentinelRow = true;
          row = [];
          cell = '';
          break;
        }
      }
      row = [];
      cell = '';
    } else cell += character;
  }
  if (!reachedSentinelRow && (cell.length > 0 || row.length > 0)) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  const headers = (rows.shift() ?? []).map((value, index) => value.trim() || `Column ${index + 1}`);
  const sourceHasMore = maximumDataRows !== undefined && rows.length > maximumDataRows;
  const boundedRows = sourceHasMore ? rows.slice(0, maximumDataRows) : rows;
  const normalized = boundedRows.map((candidate) =>
    headers.map((_, index) => candidate[index] ?? ''),
  );
  return { headers, rows: normalized, sourceHasMore };
}

const CANONICAL_DATA_IMPORT_ENCODINGS = new Set<string>(DDA_WEB_INTAKE_PROFILE_V1.csv.encodings);

type DataImportProfileProblemCodeV1 =
  | 'DDA_INTAKE_LIMIT_SIZE'
  | 'DDA_INTAKE_LIMIT_ROWS'
  | 'DDA_INTAKE_LIMIT_COLUMNS'
  | 'DDA_INTAKE_MALFORMED_ENCODING'
  | 'DDA_INTAKE_UNSUPPORTED_ENCODING';

class DataImportProfileProblemError extends Error {
  public constructor(readonly code: DataImportProfileProblemCodeV1) {
    super(code);
    this.name = 'DataImportProfileProblemError';
  }
}

function isCanonicalDataImportEncoding(value: unknown): value is DataImportDeclaredEncodingV1 {
  return typeof value === 'string' && CANONICAL_DATA_IMPORT_ENCODINGS.has(value);
}

function throwProfileProblem(code: DataImportProfileProblemCodeV1): never {
  throw new DataImportProfileProblemError(code);
}

/**
 * Reject an over-limit CSV before allocating one row array per record. The
 * authoritative Web-intake service validates the same profile again before
 * persistence; this pass exists only to construct the bounded review model.
 */
function validateCsvProfileBounds(text: string): void {
  let quoted = false;
  let columns = 1;
  let records = 0;
  let recordHasContent = false;
  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      recordHasContent = true;
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
      continue;
    }
    if (character === ',' && !quoted) {
      columns += 1;
      if (columns > DDA_WEB_INTAKE_PROFILE_V1.limits.maxColumns) {
        throwProfileProblem('DDA_INTAKE_LIMIT_COLUMNS');
      }
      continue;
    }
    const recordEnded =
      index === text.length || ((character === '\n' || character === '\r') && !quoted);
    if (!recordEnded) {
      if (character !== undefined) recordHasContent = true;
      continue;
    }
    if (character === '\r' && text[index + 1] === '\n') index += 1;
    if (recordHasContent) {
      records += 1;
      const dataRows = records - 1;
      if (dataRows > DDA_WEB_INTAKE_PROFILE_V1.limits.maxRows) {
        throwProfileProblem('DDA_INTAKE_LIMIT_ROWS');
      }
    }
    columns = 1;
    recordHasContent = false;
  }
}

interface ZipEntryV1 {
  readonly name: string;
  readonly data: Uint8Array;
  readonly compression: number;
  readonly uncompressedSize: number;
}

function readZip(bytes: Uint8Array): readonly ZipEntryV1[] {
  const buffer = Buffer.from(bytes);
  const entries: ZipEntryV1[] = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length || nameStart + nameLength > buffer.length)
      throw new Error('DDA_IMPORT_XLSX_INVALID');
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const compressed = buffer.subarray(dataStart, dataEnd);
    const data =
      compression === 0
        ? compressed
        : compression === 8
          ? inflateRawSync(compressed)
          : (() => {
              throw new Error('DDA_IMPORT_XLSX_COMPRESSION');
            })();
    if (data.length !== uncompressedSize || data.length > 4_000_000)
      throw new Error('DDA_IMPORT_XLSX_BOUNDS');
    entries.push({ name, data, compression, uncompressedSize });
    offset = dataEnd;
  }
  return entries;
}

function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function excelColumnNumber(value: string): number {
  let result = 0;
  for (const character of value) result = result * 26 + character.charCodeAt(0) - 64;
  return result - 1;
}

function parseXlsx(bytes: Uint8Array): {
  readonly headers: readonly string[];
  readonly rows: readonly string[][];
} {
  const entries = readZip(bytes);
  const shared = entries.find((entry) => entry.name === 'xl/sharedStrings.xml');
  const sharedValues =
    shared === undefined
      ? []
      : [
          ...Buffer.from(shared.data)
            .toString('utf8')
            .matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu),
        ].map((match) => xmlUnescape(match[1] ?? ''));
  const sheet = entries.find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(entry.name));
  if (!sheet) throw new Error('DDA_IMPORT_XLSX_SHEET_MISSING');
  const rows: string[][] = [];
  for (const rowMatch of Buffer.from(sheet.data)
    .toString('utf8')
    .matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gu)) {
    const values: string[] = [];
    for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
      const attributes = cellMatch[1] ?? '';
      const reference = /\br="([A-Z]+)\d+"/u.exec(attributes)?.[1];
      if (!reference) continue;
      const column = excelColumnNumber(reference);
      const type = /\bt="([^"]+)"/u.exec(attributes)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/u.exec(cellMatch[2] ?? '')?.[1] ?? '';
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/u.exec(cellMatch[2] ?? '')?.[1];
      const value =
        inline === undefined && type === 's'
          ? (sharedValues[Number(raw)] ?? '')
          : xmlUnescape(inline ?? raw);
      values[column] = value;
    }
    rows.push(values.map((value) => value ?? ''));
  }
  const headers = (rows.shift() ?? []).map((value, index) => value.trim() || `Column ${index + 1}`);
  return {
    headers,
    rows: rows.map((candidate) => headers.map((_, index) => candidate[index] ?? '')),
  };
}

function profileFile(input: DataImportCreateFileInputV1): {
  readonly source: Omit<DataImportSourceV1, 'sessionId' | 'artifactVersionId'>;
} {
  if (input.bytes.byteLength > DDA_WEB_INTAKE_PROFILE_V1.limits.maxBytes) {
    throwProfileProblem('DDA_INTAKE_LIMIT_SIZE');
  }
  if (
    input.declaredEncoding !== undefined &&
    !isCanonicalDataImportEncoding(input.declaredEncoding)
  ) {
    throwProfileProblem('DDA_INTAKE_UNSUPPORTED_ENCODING');
  }
  const csv =
    input.claimedMediaType === 'text/csv' || input.fileName.toLowerCase().endsWith('.csv');
  const decoded = csv ? decodeCsvTextV1(input.bytes, input.declaredEncoding) : undefined;
  if (decoded !== undefined && !decoded.accepted) {
    if (decoded.code === 'DDA_INTAKE_MALFORMED_ENCODING') {
      throwProfileProblem('DDA_INTAKE_MALFORMED_ENCODING');
    }
    if (
      decoded.code === 'DDA_INTAKE_UNSUPPORTED_ENCODING' ||
      decoded.code === 'DDA_INTAKE_UNSUPPORTED_PROFILE'
    ) {
      throwProfileProblem('DDA_INTAKE_UNSUPPORTED_ENCODING');
    }
    throw new Error('DDA_IMPORT_PROFILE_INVALID');
  }
  const text = decoded?.value;
  if (text !== undefined) validateCsvProfileBounds(text);
  const tabular = text === undefined ? parseXlsx(input.bytes) : parseCsv(text);
  if (tabular.headers.length === 0) throw new Error('DDA_IMPORT_PROFILE_INVALID');
  if (tabular.headers.length > DDA_WEB_INTAKE_PROFILE_V1.limits.maxColumns) {
    throwProfileProblem('DDA_INTAKE_LIMIT_COLUMNS');
  }
  if (tabular.rows.length > DDA_WEB_INTAKE_PROFILE_V1.limits.maxRows) {
    throwProfileProblem('DDA_INTAKE_LIMIT_ROWS');
  }
  const fieldValues = tabular.headers.map((_, index) =>
    tabular.rows.map((row) => row[index] ?? ''),
  );
  const fields = tabular.headers.map(
    (name, index): DataImportFieldV1 =>
      Object.freeze({
        fieldId: stableUuid(`field:${sha256(input.bytes)}:${index}`),
        name: name.slice(0, 128),
        type: inferType(fieldValues[index] ?? []),
        nullable: (fieldValues[index] ?? []).some((value) => value === '' || value === null),
      }),
  );
  const sampleRows = tabular.rows.slice(0, 20).map((row) =>
    Object.freeze(
      Object.fromEntries(
        tabular.headers.slice(0, 32).map((header, index) => {
          const value = row[index] ?? '';
          const numeric = parseNumericValue(value);
          return [
            header.slice(0, 128),
            value === '' ? null : numeric === undefined ? value : numeric,
          ];
        }),
      ),
    ),
  );
  return {
    source: Object.freeze({
      fileName: input.fileName,
      mediaType: input.claimedMediaType,
      ...(input.declaredEncoding === undefined ? {} : { declaredEncoding: input.declaredEncoding }),
      contentSha256: sha256(input.bytes),
      byteSize: input.bytes.byteLength,
      rowCount: tabular.rows.length,
      fields: Object.freeze(fields),
      sampleRows: Object.freeze(sampleRows),
    }),
  };
}

function parseApprovedTabularFile(
  bytes: Uint8Array,
  fileName: string,
  mediaType: string,
  declaredEncoding?: DataImportDeclaredEncodingV1,
): {
  readonly headers: readonly string[];
  readonly rows: readonly string[][];
  readonly sourceHasMore: boolean;
} {
  const csv = mediaType === 'text/csv' || fileName.toLowerCase().endsWith('.csv');
  let text: string | undefined;
  if (csv) {
    const decoded = decodeCsvTextV1(bytes, declaredEncoding);
    if (decoded.accepted) {
      text = decoded.value;
    } else if (declaredEncoding === undefined && decoded.code === 'DDA_INTAKE_MALFORMED_ENCODING') {
      // Imports written before the encoding became durable could only have
      // passed intake with this profile when their non-UTF-8 bytes were
      // explicitly declared Windows-1258. Preserve that approved replay path.
      const legacyDecoded = decodeCsvTextV1(bytes, 'windows-1258');
      if (!legacyDecoded.accepted) throw new Error('DDA_IMPORT_PREVIEW_ENCODING');
      text = legacyDecoded.value;
    } else {
      throw new Error('DDA_IMPORT_PREVIEW_ENCODING');
    }
  }
  const tabular =
    text === undefined
      ? Object.freeze({ ...parseXlsx(bytes), sourceHasMore: false })
      : parseCsv(text, 20_000);
  if (
    tabular.headers.length === 0 ||
    tabular.headers.length > 256 ||
    (text === undefined && tabular.rows.length > 20_000)
  ) {
    throw new Error('DDA_IMPORT_PREVIEW_BOUNDS');
  }
  return tabular;
}

function numericCell(value: string): number | undefined {
  return parseNumericValue(value);
}

function metricHint(name: string): number {
  return /amount|value|total|revenue|sales|price|cost|quantity|qty|count|số|tiền|giá|doanh|thu|chi/iu.test(
    name,
  )
    ? 1
    : 0;
}

function reviewForSources(
  sources: readonly DataImportSourceV1[],
  corrections: readonly DataImportCorrectionV1[] = [],
): DataImportReviewV1 {
  const input = sources.reduce((total, source) => total + source.rowCount, 0);
  const fields = new Set(sources.flatMap((source) => source.fields.map((field) => field.name)));
  const beforeSample = sources.flatMap((source) => source.sampleRows).slice(0, 20);
  const correctionText = corrections.map((correction) => correction.message.toLocaleLowerCase());
  const requestsCaseChange = correctionText.some(
    (message) =>
      message.includes('lowercase') ||
      message.includes('chữ thường') ||
      message.includes('uppercase') ||
      message.includes('chữ hoa'),
  );
  const requestsUppercase = correctionText.some(
    (message) => message.includes('uppercase') || message.includes('chữ hoa'),
  );
  const correctionFields = new Set(
    corrections
      .map((correction) => correction.fieldName?.trim())
      .filter((field): field is string => field !== undefined && field.length > 0),
  );
  const afterSample = beforeSample.map((row) => {
    const normalized: Record<string, string | number | boolean | null> = {};
    for (const field of Object.keys(row)) {
      const value = row[field];
      if (value === undefined) continue;
      if (typeof value !== 'string') {
        normalized[field] = value;
        continue;
      }
      const targeted = correctionFields.size === 0 || correctionFields.has(field);
      let next = value;
      // This is a bounded, lossless preparation projection. It is not an
      // AI claim and never overwrites the immutable source bytes.
      if (targeted) {
        next = next.trim().replace(/\s+/gu, ' ');
      }
      if (targeted && requestsCaseChange) {
        next = requestsUppercase ? next.toLocaleUpperCase() : next.toLocaleLowerCase();
      }
      normalized[field] = next;
    }
    return Object.freeze(normalized);
  });
  const changed = beforeSample.reduce((total, row, index) => {
    const after = afterSample[index];
    if (after === undefined) return total;
    return total + Object.keys(row).filter((field) => row[field] !== after[field]).length;
  }, 0);
  const warnings = [
    'Mọi thay đổi cần được duyệt trước khi trở thành phiên bản dữ liệu.',
    ...(changed > 0
      ? [
          'Đã nhận diện chuẩn hóa an toàn trong mẫu xem trước. Tệp nguồn bất biến vẫn được giữ nguyên cho đến khi bạn duyệt.',
        ]
      : []),
    ...(sources.length > 1 ? ['Nhiều tệp sẽ được gộp vào cùng một phiên bản được quản lý.'] : []),
    ...(fields.size === 0 ? ['Không nhận diện được cột dữ liệu.'] : []),
  ];
  return Object.freeze({
    beforeSample: Object.freeze(beforeSample),
    afterSample: Object.freeze(afterSample),
    counts: Object.freeze({ input, output: input, changed, rejected: 0 }),
    quality: Object.freeze({ completeness: 1, validity: 1, uniqueness: 1, consistency: 1 }),
    warnings: Object.freeze(warnings),
    corrections: Object.freeze([...corrections]),
    reviewRequired: true as const,
  });
}

function fieldsForDefinition(
  sources: readonly DataImportSourceV1[],
): readonly GovernedDatasetFieldV1[] {
  const byName = new Map<string, DataImportFieldV1>();
  for (const field of sources.flatMap((source) => source.fields)) {
    if (!byName.has(field.name)) byName.set(field.name, field);
  }
  return [...byName.values()].map((field) => ({
    fieldId: persistedIdentifier(field.fieldId),
    name: field.name,
    type: field.type,
    nullable: field.nullable,
    aliases: Object.freeze([]),
    localizedLabels: Object.freeze({ 'vi-VN': field.name, en: field.name }),
    sensitivity: 'INTERNAL' as const,
    defaultBehavior: 'NONE' as const,
  }));
}

export class DataImportServiceV1 {
  private readonly intake: ArtifactIntakeService | undefined;

  public constructor(
    private readonly deps: {
      readonly imports: DataImportRepositoryPortV1;
      readonly webIntake: WebIntakeServiceV1;
      readonly governedDatasets?: GovernedDatasetRepositoryPortV1;
      readonly datasetVersions?: DatasetVersionRepositoryPortV1;
      readonly artifacts?: ArtifactRepositoryPortV1;
      readonly artifactIntake?: ArtifactIntakeRepositoryPortV1;
      readonly sourceCatalogRegistration?: SourceCatalogRegistrationPortV1;
      /** IAE-owned bounded reader for the exact approved artifact bytes. */
      readonly iae?: DdaIaePortV1;
      /** Optional governed AI mapping assistance; omitted composition fails closed. */
      readonly mappingAssistance?: MappingAssistanceServiceV1;
    },
  ) {
    this.intake =
      deps.artifactIntake === undefined
        ? undefined
        : new ArtifactIntakeService(deps.artifactIntake);
  }

  public async create(
    input: DataImportCreateInputV1,
  ): Promise<DataImportResultV1<DataImportCreateValueV1>> {
    const tenantScope = input.context.tenantScope;
    if (tenantScope.scopeType !== 'workspace' || input.files.length === 0 || input.files.length > 8)
      return rejected('DDA_IMPORT_INVALID');
    if (!safeText(input.datasetName, 200) || !safeText(input.idempotencyKey, 200))
      return rejected('DDA_IMPORT_INVALID');
    if (input.destination === 'EXISTING_DATASET' && !safeText(input.datasetId, 64))
      return rejected('DDA_IMPORT_INVALID');
    if (
      input.files.some(
        (file) =>
          file.declaredEncoding !== undefined &&
          !isCanonicalDataImportEncoding(file.declaredEncoding),
      )
    ) {
      return rejected('DDA_INTAKE_UNSUPPORTED_ENCODING');
    }
    const fingerprint = sha256(
      canonicalJson({
        destination: input.destination,
        datasetId: input.datasetId,
        datasetName: input.datasetName,
        files: input.files.map((file) => ({
          fileName: file.fileName,
          mediaType: file.claimedMediaType,
          declaredEncoding: file.declaredEncoding,
          sha256: sha256(file.bytes),
          bytes: file.bytes.byteLength,
        })),
      }),
    );
    const importId = stableUuid(
      `data-import:${tenantScope.organizationId}:${tenantScope.workspaceId}:${input.idempotencyKey}`,
    );
    const existing = await this.deps.imports.findById(importId, tenantScope);
    if (existing !== undefined) {
      if (existing.payloadFingerprint !== fingerprint) return rejected('DDA_IMPORT_CONFLICT');
      return Object.freeze({ accepted: true, replayed: true, value: this.toCreateValue(existing) });
    }
    const sources: DataImportSourceV1[] = [];
    try {
      for (const file of input.files) {
        const profiled = profileFile(file);
        const uploaded = await this.deps.webIntake.uploadFile(
          {
            tenantScope,
            fileName: file.fileName,
            claimedMediaType: file.claimedMediaType,
            expectedSha256: profiled.source.contentSha256,
            bytes: file.bytes,
            idempotencyKey: `${input.idempotencyKey}:${profiled.source.contentSha256}`,
            ...(file.declaredEncoding === undefined
              ? {}
              : { declaredEncoding: file.declaredEncoding }),
          },
          input.context,
        );
        if (!uploaded.accepted) {
          if (
            uploaded.code === 'DDA_INTAKE_LIMIT_SIZE' ||
            uploaded.code === 'DDA_INTAKE_LIMIT_ROWS' ||
            uploaded.code === 'DDA_INTAKE_LIMIT_COLUMNS' ||
            uploaded.code === 'DDA_INTAKE_MALFORMED_ENCODING' ||
            uploaded.code === 'DDA_INTAKE_UNSUPPORTED_ENCODING'
          ) {
            return rejected(uploaded.code);
          }
          return rejected('DDA_IMPORT_UNAVAILABLE');
        }
        sources.push(
          Object.freeze({
            ...profiled.source,
            sessionId: uploaded.value.sessionId,
            artifactVersionId: uploaded.value.artifactVersionId,
          }),
        );
      }
    } catch (error) {
      if (error instanceof DataImportProfileProblemError) return rejected(error.code);
      return rejected('DDA_IMPORT_UNAVAILABLE');
    }
    const review = reviewForSources(sources);
    const createdAt = now();
    const record: DataImportRecordV1 = Object.freeze({
      importId,
      tenantScope,
      revision: 1,
      state: 'REVIEW_REQUIRED',
      destination: input.destination,
      ...(input.datasetId === undefined ? {} : { datasetId: input.datasetId }),
      datasetName: input.datasetName.trim(),
      idempotencyKey: input.idempotencyKey,
      payloadFingerprint: fingerprint,
      sources: Object.freeze(sources),
      review,
      createdAt,
      updatedAt: createdAt,
    });
    await this.deps.imports.save(record);
    return Object.freeze({ accepted: true, value: this.toCreateValue(record) });
  }

  public async get(
    importId: string,
    tenantScope: TenantScopeV1,
  ): Promise<DataImportResultV1<DataImportPublicRecordV1>> {
    const record = await this.deps.imports.findById(importId, tenantScope);
    return record === undefined
      ? rejected('DDA_IMPORT_NOT_FOUND')
      : Object.freeze({ accepted: true, value: this.toPublicValue(record) });
  }

  public async list(
    tenantScope: TenantScopeV1,
    limit = 50,
  ): Promise<readonly DataImportPublicRecordV1[]> {
    const records = await this.deps.imports.list(tenantScope, Math.min(50, Math.max(1, limit)));
    return Object.freeze(records.map((record) => this.toPublicValue(record)));
  }

  /**
   * DDA-005/006/008/010/011/036/043-045: construct a bounded, server-owned
   * mapping request from the persisted review. The browser supplies consent
   * only; it never supplies tenant, schema, field, or sample authority.
   */
  public async mappingSuggestions(input: {
    readonly importId: string;
    readonly context: IamTenantContextV1;
    readonly samplePermissionGranted: boolean;
    readonly locale: 'vi' | 'en';
  }): Promise<DataImportResultV1<DataImportMappingSuggestionsV1>> {
    const current = await this.deps.imports.findById(input.importId, input.context.tenantScope);
    if (current === undefined) return rejected('DDA_IMPORT_NOT_FOUND');
    if (!['REVIEW_REQUIRED', 'REVISING'].includes(current.state)) {
      return rejected('DDA_IMPORT_REVIEW_REQUIRED');
    }
    if (this.deps.mappingAssistance === undefined) return rejected('ADAPTER_UNAVAILABLE');

    const fields = current.sources.flatMap((source) => source.fields);
    const headers = [...new Set(fields.map((field) => field.name))].slice(0, 256);
    if (headers.length === 0) return rejected('DDA_IMPORT_INVALID');
    const typeProfiles = Object.freeze(
      Object.fromEntries(
        fields
          .filter(
            (field, index) =>
              fields.findIndex((candidate) => candidate.name === field.name) === index,
          )
          .slice(0, 256)
          .map((field) => [field.name, field.type]),
      ),
    );
    const boundedSamples: Readonly<Record<string, string>>[] = [];
    for (const source of current.sources) {
      for (const row of source.sampleRows.slice(0, 5)) {
        const bounded: Record<string, string> = {};
        for (const header of headers.slice(0, 64)) {
          const value = row[header];
          if (value === undefined || value === null) continue;
          const textValue = String(value).slice(0, 256);
          bounded[header] = textValue;
        }
        boundedSamples.push(Object.freeze(bounded));
        if (boundedSamples.length >= 20) break;
      }
      if (boundedSamples.length >= 20) break;
    }
    const request: MappingAssistanceRequestV1 = Object.freeze({
      tenantScope: input.context.tenantScope,
      schemaVersionId: stableUuid(`${current.importId}:mapping:schema:${current.revision}`),
      profileVersionId: stableUuid(`${current.importId}:mapping:profile:${current.revision}`),
      headers: Object.freeze(headers),
      typeProfiles,
      targetFields: Object.freeze(headers),
      locale: input.locale,
      boundedSamples: Object.freeze(boundedSamples),
      samplePermissionGranted: input.samplePermissionGranted,
      payloadBytes: Buffer.byteLength(
        JSON.stringify({ headers, typeProfiles, boundedSamples }),
        'utf8',
      ),
    });
    const result = await this.deps.mappingAssistance.suggest(request);
    if (!result.accepted) return rejected(result.code);
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        importId: current.importId,
        revision: current.revision,
        suggestions: Object.freeze(result.value.suggestions),
        adapterUsed: result.value.adapterUsed,
        authoritative: false as const,
        generatedAt: now(),
      }),
    });
  }

  /**
   * Build a bounded, reload-safe read model from the immutable approved bytes.
   * This deliberately does not create a DDA snapshot/result manifest: until
   * the JRA worker path is available this is a clearly-labelled dataset
   * preview, not a certified dashboard publication.
   */
  public async dashboardPreview(input: {
    readonly importId: string;
    readonly context: IamTenantContextV1;
  }): Promise<DataImportResultV1<DataImportDashboardPreviewV1>> {
    const current = await this.deps.imports.findById(input.importId, input.context.tenantScope);
    if (current === undefined) return rejected('DDA_IMPORT_NOT_FOUND');
    if (current.state !== 'READY' || current.accepted === undefined) {
      return rejected('DDA_IMPORT_REVIEW_REQUIRED');
    }
    if (this.deps.iae === undefined || current.sources.length === 0) {
      return rejected('DDA_IMPORT_UNAVAILABLE');
    }

    try {
      const allHeaders: string[] = [];
      const rows: Array<Record<string, string>> = [];
      let sourceHasMore = false;
      for (const source of current.sources) {
        const opened = await this.deps.iae.openProcessingContent({
          tenantScope: input.context.tenantScope,
          artifactVersionId: source.artifactVersionId,
          expectedContentSha256: source.contentSha256,
          maximumByteLength: 100 * 1024 * 1024,
          allowedMediaTypes: Object.freeze([
            'text/csv',
            'application/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ]),
        });
        if (!opened.accepted) return rejected('DDA_IMPORT_ARTIFACT_UNAVAILABLE');
        const tabular = parseApprovedTabularFile(
          opened.value.bytes,
          source.fileName,
          opened.value.mediaType,
          source.declaredEncoding,
        );
        sourceHasMore ||= tabular.sourceHasMore;
        for (const header of tabular.headers) {
          if (!allHeaders.includes(header)) allHeaders.push(header);
        }
        for (const candidate of tabular.rows) {
          if (rows.length >= 20_000) {
            sourceHasMore = true;
            break;
          }
          rows.push(
            Object.fromEntries(
              tabular.headers.map((header, index) => [header, candidate[index] ?? '']),
            ),
          );
        }
      }
      if (allHeaders.length === 0 || rows.length === 0) return rejected('DDA_IMPORT_INVALID');

      const fieldsByName = new Map(
        current.sources.flatMap((source) => source.fields).map((field) => [field.name, field]),
      );
      const columns = Object.freeze(
        allHeaders.slice(0, 256).map((name) => {
          const field = fieldsByName.get(name);
          const values = rows.map((row) => row[name] ?? '');
          return Object.freeze({
            name: name.slice(0, 128),
            type: field?.type ?? inferType(values),
            nullable: field?.nullable ?? values.some((value) => value.trim() === ''),
          });
        }),
      );
      const numericCandidates = allHeaders
        .map((field) => {
          const values = rows
            .map((row) => numericCell(row[field] ?? ''))
            .filter((value): value is number => value !== undefined);
          return { field, values };
        })
        .filter((candidate) => candidate.values.length > 0)
        .sort(
          (left, right) =>
            metricHint(right.field) - metricHint(left.field) ||
            right.values.length - left.values.length ||
            left.field.localeCompare(right.field),
        );
      const numeric = numericCandidates[0];
      const measure =
        numeric === undefined
          ? undefined
          : Object.freeze({
              field: numeric.field,
              sum: numeric.values.reduce((total, value) => total + value, 0),
              average:
                numeric.values.length === 0
                  ? 0
                  : numeric.values.reduce((total, value) => total + value, 0) /
                    numeric.values.length,
              minimum: Math.min(...numeric.values),
              maximum: Math.max(...numeric.values),
            });
      const dimensionCandidate = allHeaders.find((field) => {
        if (field === numeric?.field) return false;
        const distinct = new Set(
          rows.map((row) => row[field]?.trim()).filter((value): value is string => value !== ''),
        );
        return distinct.size > 1 && distinct.size <= 100;
      });
      const dimension =
        dimensionCandidate === undefined
          ? undefined
          : (() => {
              const grouped = new Map<string, { count: number; total: number }>();
              for (const row of rows) {
                const label = row[dimensionCandidate]?.trim();
                if (!label) continue;
                const currentGroup = grouped.get(label) ?? { count: 0, total: 0 };
                currentGroup.count += 1;
                const value =
                  numeric === undefined ? undefined : numericCell(row[numeric.field] ?? '');
                if (value !== undefined) currentGroup.total += value;
                grouped.set(label, currentGroup);
              }
              return Object.freeze({
                field: dimensionCandidate,
                groups: Object.freeze(
                  [...grouped.entries()]
                    .sort(
                      (left, right) =>
                        right[1].count - left[1].count || left[0].localeCompare(right[0]),
                    )
                    .slice(0, 12)
                    .map(([label, group]) =>
                      Object.freeze({
                        label: label.slice(0, 128),
                        count: group.count,
                        ...(numeric === undefined ? {} : { total: group.total }),
                      }),
                    ),
                ),
              });
            })();
      const sampleRows = Object.freeze(
        rows.slice(0, 25).map((row) =>
          Object.freeze(
            Object.fromEntries(
              allHeaders.slice(0, 32).map((header) => {
                const value = row[header] ?? '';
                const numericValue = numericCell(value);
                const normalized =
                  value.trim() === ''
                    ? null
                    : numericValue !== undefined
                      ? numericValue
                      : value === 'true' || value === 'false'
                        ? value === 'true'
                        : value;
                return [header.slice(0, 128), normalized];
              }),
            ),
          ),
        ),
      );
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          importId: current.importId,
          datasetId: current.accepted.datasetId,
          datasetVersionId: current.accepted.datasetVersionId,
          datasetName: current.datasetName,
          sourceCount: current.sources.length,
          rowCount: rows.length,
          truncated: sourceHasMore,
          sourceHashes: Object.freeze(current.sources.map((source) => source.contentSha256)),
          columns,
          ...(measure === undefined ? {} : { measure }),
          ...(dimension === undefined ? {} : { dimension }),
          sampleRows,
          generatedAt: now(),
        }),
      });
    } catch {
      return rejected('DDA_IMPORT_UNAVAILABLE');
    }
  }

  public async addCorrection(input: {
    readonly importId: string;
    readonly context: IamTenantContextV1;
    readonly expectedRevision: number;
    readonly message: string;
    readonly fieldName?: string;
  }): Promise<DataImportResultV1<DataImportPublicRecordV1>> {
    if (
      !safeText(input.message, 2_000) ||
      (input.fieldName !== undefined && !safeText(input.fieldName, 128))
    )
      return rejected('DDA_IMPORT_INVALID');
    const current = await this.deps.imports.findById(input.importId, input.context.tenantScope);
    if (current === undefined) return rejected('DDA_IMPORT_NOT_FOUND');
    if (current.revision !== input.expectedRevision)
      return rejected('DDA_IMPORT_REVISION_CONFLICT');
    if (!['REVIEW_REQUIRED', 'REVISING'].includes(current.state))
      return rejected('DDA_IMPORT_CONFLICT');
    const correction: DataImportCorrectionV1 = Object.freeze({
      correctionId: stableUuid(`${input.importId}:correction:${current.revision + 1}`),
      message: input.message.trim(),
      ...(input.fieldName === undefined ? {} : { fieldName: input.fieldName.trim() }),
      createdAt: now(),
    });
    const corrections = Object.freeze([...current.review.corrections, correction]);
    const updated: DataImportRecordV1 = Object.freeze({
      ...current,
      revision: current.revision + 1,
      state: 'REVIEW_REQUIRED',
      review: reviewForSources(current.sources, corrections),
      updatedAt: correction.createdAt,
    });
    try {
      await this.deps.imports.save(updated, current.revision);
    } catch (error) {
      if (error instanceof Error && error.message === 'DDA_IMPORT_REVISION_CONFLICT') {
        return rejected('DDA_IMPORT_REVISION_CONFLICT');
      }
      return rejected('DDA_IMPORT_UNAVAILABLE');
    }
    return Object.freeze({ accepted: true, value: this.toPublicValue(updated) });
  }

  public async approve(input: {
    readonly importId: string;
    readonly context: IamTenantContextV1;
    readonly expectedRevision: number;
    readonly idempotencyKey: string;
  }): Promise<DataImportResultV1<DataImportPublicRecordV1>> {
    const current = await this.deps.imports.findById(input.importId, input.context.tenantScope);
    if (current === undefined) return rejected('DDA_IMPORT_NOT_FOUND');
    if (current.state === 'READY' && current.accepted !== undefined) {
      if (current.accepted.approvalIdempotencyKey !== input.idempotencyKey) {
        return rejected('DDA_IMPORT_CONFLICT');
      }
      return Object.freeze({
        accepted: true,
        value: this.toPublicValue(current),
        replayed: true,
      });
    }
    if (current.revision !== input.expectedRevision)
      return rejected('DDA_IMPORT_REVISION_CONFLICT');
    if (current.state !== 'REVIEW_REQUIRED') return rejected('DDA_IMPORT_REVIEW_REQUIRED');
    if (
      this.deps.governedDatasets === undefined ||
      this.deps.datasetVersions === undefined ||
      this.deps.artifacts === undefined ||
      this.intake === undefined
    )
      return rejected('DDA_IMPORT_UNAVAILABLE');
    const fields = fieldsForDefinition(current.sources);
    if (fields.length === 0) return rejected('DDA_IMPORT_INVALID');
    const currentDefinition =
      current.datasetId === undefined
        ? undefined
        : await this.latestPublished(input.context, persistedIdentifier(current.datasetId));
    const datasetId = current.datasetId ?? stableUuid(`${current.importId}:dataset`);
    const draftVersionId = stableUuid(`${current.importId}:definition:draft:${current.revision}`);
    const publishedVersionId = stableUuid(
      `${current.importId}:definition:published:${current.revision}`,
    );
    const createdAt = now();
    const definitionFields =
      currentDefinition === undefined
        ? fields
        : Object.freeze([
            ...currentDefinition.fields,
            ...fields.filter(
              (field) => !currentDefinition.fields.some((existing) => existing.name === field.name),
            ),
          ]);
    const draftHash = sha256(
      canonicalJson({
        datasetId,
        versionId: draftVersionId,
        fields: definitionFields,
        name: current.datasetName,
      }),
    );
    const draft = createGovernedDatasetDefinitionV1({
      datasetId,
      versionId: draftVersionId,
      tenantScope: input.context.tenantScope,
      name: current.datasetName,
      fields: definitionFields,
      status: 'DRAFT',
      createdAt,
      canonicalHash: draftHash,
    });
    if (!draft.accepted) return rejected('DDA_IMPORT_INVALID');
    const published = publishGovernedDatasetDefinitionV1(
      draft.value,
      publishedVersionId,
      createdAt,
    );
    if (!published.accepted) return rejected('DDA_IMPORT_INVALID');
    const activatedArtifacts = new Map<
      string,
      NonNullable<Awaited<ReturnType<ArtifactRepositoryPortV1['findVersion']>>>
    >();
    try {
      await this.deps.governedDatasets.save(input.context, draft.value);
      await this.deps.governedDatasets.save(input.context, published.value);
      for (const source of current.sources) {
        const artifact = await this.deps.artifacts.findVersion(
          input.context,
          persistedIdentifier(source.artifactVersionId),
        );
        if (artifact === undefined) return rejected('DDA_IMPORT_ARTIFACT_UNAVAILABLE');
        const activated = await this.deps.artifacts.updateVersionStatus(
          input.context,
          persistedIdentifier(source.artifactVersionId),
          'ACTIVE',
          'CLEAN',
        );
        if (activated === undefined) return rejected('DDA_IMPORT_ARTIFACT_UNAVAILABLE');
        const admitted = await this.intake.admit(
          input.context,
          persistedIdentifier(source.sessionId),
          activated,
          {
            actualSha256: source.contentSha256,
            actualByteSize: source.byteSize,
            detectedMediaType: source.mediaType,
            scanState: 'CLEAN',
            maxByteSize: 100 * 1024 * 1024,
          },
        );
        if (!admitted.accepted) return rejected('DDA_IMPORT_ARTIFACT_UNAVAILABLE');
        activatedArtifacts.set(source.artifactVersionId, activated);
      }
      const contentFingerprint = sha256(
        canonicalJson(current.sources.map((source) => source.contentSha256)),
      );
      const lineageManifestHash = sha256(
        canonicalJson({
          parents: current.sources.map((source) => source.artifactVersionId),
          importId: current.importId,
        }),
      );
      const manifest = createDatasetVersionManifestV1({
        datasetId,
        versionId: stableUuid(`${current.importId}:dataset-version:${current.revision}`),
        tenantScope: input.context.tenantScope,
        inputArtifactVersionIds: current.sources.map((source) =>
          persistedIdentifier(source.artifactVersionId),
        ),
        schemaVersionId: publishedVersionId,
        mappingVersionId: stableUuid(`${current.importId}:mapping:${current.revision}`),
        ruleSetVersionId: stableUuid(`${current.importId}:rules:${current.revision}`),
        engineBuild: 'local-web-import.v1',
        contentFingerprint,
        rowCount: current.review.counts.output,
        qualityState: current.review.corrections.length === 0 ? 'PASS' : 'PASS_WITH_WARNINGS',
        lineageManifestHash,
      });
      if (!manifest.accepted) return rejected('DDA_IMPORT_INVALID');
      await this.deps.datasetVersions.save(input.context, manifest.value);
      const acceptedAt = now();
      if (this.deps.sourceCatalogRegistration !== undefined) {
        if (input.context.tenantScope.scopeType !== 'workspace') {
          return rejected('DDA_IMPORT_UNAUTHORIZED');
        }
        for (const source of current.sources) {
          const artifact = activatedArtifacts.get(source.artifactVersionId);
          if (
            artifact === undefined ||
            artifact.status !== 'ACTIVE' ||
            artifact.scanState !== 'CLEAN'
          ) {
            return rejected('DDA_IMPORT_ARTIFACT_UNAVAILABLE');
          }
          const sourceRecord: SourceCatalogRecordV1 = Object.freeze({
            id: stableUuid(
              `${current.importId}:source:${source.artifactVersionId}`,
            ) as StableIdentifierV1,
            organizationId: input.context.tenantScope.organizationId,
            workspaceId: input.context.tenantScope.workspaceId,
            dsmDatasetId: persistedIdentifier(datasetId),
            iaeArtifactVersionId: persistedIdentifier(source.artifactVersionId),
            sourceType: sourceType(source.fileName, source.mediaType),
            safeDisplayLabel: safeDisplayLabel(source.fileName),
            status: 'ACTIVE',
            health: 'UNKNOWN',
            versionId: persistedIdentifier(source.artifactVersionId),
            dataMode: sourceDataMode(artifact.dataMode),
            revision: 1,
            updatedAt: acceptedAt,
            previewKind:
              sourceType(source.fileName, source.mediaType) === 'XLSX'
                ? 'XLSX_SAFE_GRID'
                : 'CSV_SAFE_GRID',
          });
          await this.deps.sourceCatalogRegistration.register(input.context, sourceRecord);
        }
      }
      const updated: DataImportRecordV1 = Object.freeze({
        ...current,
        revision: current.revision + 1,
        state: 'READY',
        datasetId,
        accepted: Object.freeze({
          datasetId,
          datasetVersionId: manifest.value.versionId,
          definitionVersionId: publishedVersionId,
          // The approved-data preview is available immediately; certified
          // snapshot publication remains a separate worker-owned lifecycle.
          dashboardStatus: 'BUILDING' as const,
          approvalIdempotencyKey: input.idempotencyKey,
          approvedAt: acceptedAt,
        }),
        updatedAt: acceptedAt,
      });
      try {
        await this.deps.imports.save(updated, current.revision);
      } catch (error) {
        if (error instanceof Error && error.message === 'DDA_IMPORT_REVISION_CONFLICT') {
          return rejected('DDA_IMPORT_REVISION_CONFLICT');
        }
        return rejected('DDA_IMPORT_UNAVAILABLE');
      }
      return Object.freeze({ accepted: true, value: this.toPublicValue(updated) });
    } catch {
      return rejected('DDA_IMPORT_UNAVAILABLE');
    }
  }

  private async latestPublished(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<GovernedDatasetDefinitionV1 | undefined> {
    if (this.deps.governedDatasets === undefined) return undefined;
    const versions = await this.deps.governedDatasets.list(context, datasetId);
    return versions
      .filter((version) => version.status === 'PUBLISHED')
      .sort((left, right) =>
        (right.publishedAt ?? right.createdAt).localeCompare(left.publishedAt ?? left.createdAt),
      )[0];
  }

  private toCreateValue(record: DataImportRecordV1): DataImportCreateValueV1 {
    return Object.freeze({
      importId: record.importId,
      revision: record.revision,
      state: record.state,
      destination: record.destination,
      ...(record.datasetId === undefined ? {} : { datasetId: record.datasetId }),
      idempotencyKey: record.idempotencyKey,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      sources: record.sources,
      review: record.review,
      datasetName: record.datasetName,
    });
  }

  private toPublicValue(record: DataImportRecordV1): DataImportPublicRecordV1 {
    return Object.freeze({
      importId: record.importId,
      revision: record.revision,
      state: record.state,
      destination: record.destination,
      ...(record.datasetId === undefined ? {} : { datasetId: record.datasetId }),
      datasetName: record.datasetName,
      idempotencyKey: record.idempotencyKey,
      sources: record.sources,
      review: record.review,
      ...(record.accepted === undefined ? {} : { accepted: record.accepted }),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
