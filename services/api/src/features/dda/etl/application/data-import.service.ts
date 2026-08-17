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
import type { ArtifactRepositoryPortV1 } from '../../../iae/application/artifact-repository.port.js';
import { ArtifactIntakeService } from '../../../iae/application/artifact-intake.service.js';
import type { ArtifactIntakeRepositoryPortV1 } from '../../../iae/application/artifact-intake-repository.port.js';
import type { DatasetVersionRepositoryPortV1 } from '../../../dsm/application/dataset-version-repository.port.js';
import type { GovernedDatasetRepositoryPortV1 } from '../../../dsm/application/governed-dataset-repository.port.js';
import { WebIntakeServiceV1 } from '../../intake/application/web-intake.service.js';
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

export type DataImportProblemCodeV1 =
  | 'DDA_IMPORT_NOT_FOUND'
  | 'DDA_IMPORT_INVALID'
  | 'DDA_IMPORT_CONFLICT'
  | 'DDA_IMPORT_UNAVAILABLE'
  | 'DDA_IMPORT_UNAUTHORIZED'
  | 'DDA_IMPORT_REVIEW_REQUIRED'
  | 'DDA_IMPORT_REVISION_CONFLICT'
  | 'DDA_IMPORT_DATASET_UNAVAILABLE'
  | 'DDA_IMPORT_ARTIFACT_UNAVAILABLE';

export type DataImportResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue; readonly replayed?: boolean }
  | { readonly accepted: false; readonly code: DataImportProblemCodeV1 };

export interface DataImportCreateFileInputV1 {
  readonly fileName: string;
  readonly claimedMediaType: string;
  readonly bytes: Uint8Array;
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

function inferType(values: readonly unknown[]): DataImportFieldV1['type'] {
  const present = values.filter((value) => value !== null && value !== undefined && value !== '');
  if (present.length === 0) return 'TEXT';
  if (present.every((value) => typeof value === 'boolean' || value === 'true' || value === 'false'))
    return 'BOOLEAN';
  if (
    present.every(
      (value) => typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/u.test(value)),
    )
  )
    return 'INTEGER';
  if (
    present.every(
      (value) =>
        typeof value === 'number' ||
        (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/u.test(value)),
    )
  )
    return 'DECIMAL';
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

function parseCsv(text: string): {
  readonly headers: readonly string[];
  readonly rows: readonly string[][];
} {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
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
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  const headers = (rows.shift() ?? []).map((value, index) => value.trim() || `Column ${index + 1}`);
  const normalized = rows.map((candidate) => headers.map((_, index) => candidate[index] ?? ''));
  return { headers, rows: normalized };
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
  const text =
    input.claimedMediaType === 'text/csv' || input.fileName.toLowerCase().endsWith('.csv')
      ? new TextDecoder('utf-8', { fatal: true }).decode(input.bytes).replace(/^\uFEFF/u, '')
      : undefined;
  const tabular = text === undefined ? parseXlsx(input.bytes) : parseCsv(text);
  if (tabular.headers.length === 0 || tabular.headers.length > 256 || tabular.rows.length > 20_000)
    throw new Error('DDA_IMPORT_PROFILE_INVALID');
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
          const numeric = /^-?\d+(?:\.\d+)?$/u.test(value.trim()) ? Number(value) : value;
          return [header.slice(0, 128), value === '' ? null : numeric];
        }),
      ),
    ),
  );
  return {
    source: Object.freeze({
      fileName: input.fileName,
      mediaType: input.claimedMediaType,
      contentSha256: sha256(input.bytes),
      byteSize: input.bytes.byteLength,
      rowCount: tabular.rows.length,
      fields: Object.freeze(fields),
      sampleRows: Object.freeze(sampleRows),
    }),
  };
}

function reviewForSources(
  sources: readonly DataImportSourceV1[],
  corrections: readonly DataImportCorrectionV1[] = [],
): DataImportReviewV1 {
  const input = sources.reduce((total, source) => total + source.rowCount, 0);
  const fields = new Set(sources.flatMap((source) => source.fields.map((field) => field.name)));
  const warnings = [
    'Mọi thay đổi cần được duyệt trước khi trở thành phiên bản dữ liệu.',
    ...(sources.length > 1 ? ['Nhiều tệp sẽ được gộp vào cùng một phiên bản được quản lý.'] : []),
    ...(fields.size === 0 ? ['Không nhận diện được cột dữ liệu.'] : []),
  ];
  return Object.freeze({
    beforeSample: Object.freeze(sources.flatMap((source) => source.sampleRows).slice(0, 20)),
    afterSample: Object.freeze(sources.flatMap((source) => source.sampleRows).slice(0, 20)),
    counts: Object.freeze({ input, output: input, changed: 0, rejected: 0 }),
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
    const fingerprint = sha256(
      canonicalJson({
        destination: input.destination,
        datasetId: input.datasetId,
        datasetName: input.datasetName,
        files: input.files.map((file) => ({
          fileName: file.fileName,
          mediaType: file.claimedMediaType,
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
          },
          input.context,
        );
        if (!uploaded.accepted) return rejected('DDA_IMPORT_UNAVAILABLE');
        sources.push(
          Object.freeze({
            ...profiled.source,
            sessionId: uploaded.value.sessionId,
            artifactVersionId: uploaded.value.artifactVersionId,
          }),
        );
      }
    } catch {
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
  ): Promise<DataImportResultV1<DataImportRecordV1>> {
    const record = await this.deps.imports.findById(importId, tenantScope);
    return record === undefined
      ? rejected('DDA_IMPORT_NOT_FOUND')
      : Object.freeze({ accepted: true, value: record });
  }

  public async list(
    tenantScope: TenantScopeV1,
    limit = 50,
  ): Promise<readonly DataImportRecordV1[]> {
    return this.deps.imports.list(tenantScope, Math.min(50, Math.max(1, limit)));
  }

  public async addCorrection(input: {
    readonly importId: string;
    readonly context: IamTenantContextV1;
    readonly expectedRevision: number;
    readonly message: string;
    readonly fieldName?: string;
  }): Promise<DataImportResultV1<DataImportRecordV1>> {
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
    return Object.freeze({ accepted: true, value: updated });
  }

  public async approve(input: {
    readonly importId: string;
    readonly context: IamTenantContextV1;
    readonly expectedRevision: number;
    readonly idempotencyKey: string;
  }): Promise<DataImportResultV1<DataImportRecordV1>> {
    const current = await this.deps.imports.findById(input.importId, input.context.tenantScope);
    if (current === undefined) return rejected('DDA_IMPORT_NOT_FOUND');
    if (current.revision !== input.expectedRevision)
      return rejected('DDA_IMPORT_REVISION_CONFLICT');
    if (current.state === 'READY' && current.accepted !== undefined) {
      if (current.accepted.approvalIdempotencyKey !== input.idempotencyKey) {
        return rejected('DDA_IMPORT_CONFLICT');
      }
      return Object.freeze({ accepted: true, value: current, replayed: true });
    }
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
    const activatedArtifacts = new Map<string, NonNullable<Awaited<ReturnType<ArtifactRepositoryPortV1['findVersion']>>>>();
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
          if (artifact === undefined || artifact.status !== 'ACTIVE' || artifact.scanState !== 'CLEAN') {
            return rejected('DDA_IMPORT_ARTIFACT_UNAVAILABLE');
          }
          const sourceRecord: SourceCatalogRecordV1 = Object.freeze({
            id: stableUuid(`${current.importId}:source:${source.artifactVersionId}`) as StableIdentifierV1,
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
            previewKind: sourceType(source.fileName, source.mediaType) === 'XLSX' ? 'XLSX_SAFE_GRID' : 'CSV_SAFE_GRID',
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
          dashboardStatus: 'UNAVAILABLE' as const,
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
      return Object.freeze({ accepted: true, value: updated });
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
}
