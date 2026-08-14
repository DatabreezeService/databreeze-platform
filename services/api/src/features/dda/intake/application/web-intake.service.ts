import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { LocalWebIntakeUploadInputV1 } from '../../../iae/application/local-web-intake.port.js';

import {
  DDA_WEB_INTAKE_PROFILE_V1,
  type DdaIntakeProblemCodeV1,
  type DdaWebIntakeProfileV1,
  type IntakeIaeFinalizationPortV1,
  type IntakeIaeUploadPortV1,
} from './intake-profile.port.js';

export type WebIntakeResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DdaIntakeProblemCodeV1 };

export interface WebIntakeFinalizeInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly sessionId: string;
  readonly fileName: string;
  readonly claimedMediaType: string;
  readonly expectedSha256: string;
  readonly bytes: Uint8Array;
  readonly declaredEncoding?: string;
}

export interface WebIntakeFinalizeValueV1 {
  readonly sessionId: string;
  readonly artifactVersionId: string;
  readonly status: 'FINALIZED';
  readonly profileId: 'dda.web.tabular.v1';
}

export interface WebIntakeUploadInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly fileName: string;
  readonly claimedMediaType: string;
  readonly expectedSha256: string;
  readonly bytes: Uint8Array;
  readonly idempotencyKey: string;
  readonly declaredEncoding?: string;
}

const XLSX_MEDIA = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function rejected(code: DdaIntakeProblemCodeV1): WebIntakeResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function looksLikeExecutable(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a;
}

export function decodeCsvTextV1(
  bytes: Uint8Array,
  declaredEncoding: string | undefined,
): WebIntakeResultV1<string> {
  const encoding = (declaredEncoding ?? 'utf-8').toLowerCase();
  if (!DDA_WEB_INTAKE_PROFILE_V1.csv.encodings.includes(encoding)) {
    return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  }
  try {
    const decoder = new TextDecoder(encoding === 'windows-1258' ? 'windows-1258' : 'utf-8', {
      fatal: true,
    });
    const text = decoder.decode(bytes).replace(/^\uFEFF/u, '');
    return Object.freeze({ accepted: true, value: text });
  } catch (error) {
    if (encoding === 'windows-1258' && error instanceof RangeError) {
      return rejected('DDA_INTAKE_UNSUPPORTED_ENCODING');
    }
    return rejected('DDA_INTAKE_MALFORMED_ENCODING');
  }
}

function countCsvColumns(record: string): number {
  let columns = 1;
  let quoted = false;
  for (let index = 0; index < record.length; index += 1) {
    const character = record[index];
    if (character === '"') {
      if (quoted && record[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      columns += 1;
    }
  }
  return quoted ? Number.MAX_SAFE_INTEGER : columns;
}

function inspectCsv(
  bytes: Uint8Array,
  declaredEncoding?: string,
): WebIntakeResultV1<{ readonly kind: 'CSV' }> {
  if (looksLikeExecutable(bytes)) return rejected('DDA_INTAKE_RENAMED_EXECUTABLE');
  if (bytes.length > DDA_WEB_INTAKE_PROFILE_V1.limits.maxBytes)
    return rejected('DDA_INTAKE_LIMIT_SIZE');
  const decoded = decodeCsvTextV1(bytes, declaredEncoding);
  if (!decoded.accepted) return decoded;
  const normalized = decoded.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstBreak = normalized.indexOf('\n');
  const header = firstBreak < 0 ? normalized : normalized.slice(0, firstBreak);
  if (header.length === 0) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  const headerColumns = countCsvColumns(header);
  if (headerColumns > DDA_WEB_INTAKE_PROFILE_V1.limits.maxColumns) {
    return rejected('DDA_INTAKE_LIMIT_COLUMNS');
  }
  let dataRows = 0;
  let recordStart = firstBreak < 0 ? normalized.length : firstBreak + 1;
  for (let index = recordStart; index <= normalized.length; index += 1) {
    if (index !== normalized.length && normalized[index] !== '\n') continue;
    const record = normalized.slice(recordStart, index);
    recordStart = index + 1;
    if (record.length === 0 && index === normalized.length) continue;
    dataRows += 1;
    if (countCsvColumns(record) > DDA_WEB_INTAKE_PROFILE_V1.limits.maxColumns) {
      return rejected('DDA_INTAKE_LIMIT_COLUMNS');
    }
    if (dataRows > DDA_WEB_INTAKE_PROFILE_V1.limits.maxRows) {
      return rejected('DDA_INTAKE_LIMIT_ROWS');
    }
  }
  return Object.freeze({ accepted: true, value: Object.freeze({ kind: 'CSV' as const }) });
}

interface ZipLocalEntry {
  readonly name: string;
  readonly compressed: Uint8Array;
  readonly uncompressedSize: number;
  readonly compression: number;
}

function readZipEntries(bytes: Uint8Array): WebIntakeResultV1<readonly ZipLocalEntry[]> {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
    return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  }
  const entries: ZipLocalEntry[] = [];
  const names = new Set<string>();
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50 || offset + 30 > buffer.length) {
      return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
    }
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const dataStart = nameEnd + extraLength;
    if (
      nameEnd > buffer.length ||
      dataStart > buffer.length ||
      compressedSize > buffer.length - dataStart
    ) {
      return rejected('DDA_INTAKE_ZIP_BOMB');
    }
    if (entries.length >= DDA_WEB_INTAKE_PROFILE_V1.limits.maxZipEntries) {
      return rejected('DDA_INTAKE_ZIP_BOMB');
    }
    if (uncompressedSize > DDA_WEB_INTAKE_PROFILE_V1.limits.maxZipEntryBytes) {
      return rejected('DDA_INTAKE_ZIP_BOMB');
    }
    if (
      compressedSize > 0 &&
      uncompressedSize / compressedSize > DDA_WEB_INTAKE_PROFILE_V1.limits.maxZipRatio
    ) {
      return rejected('DDA_INTAKE_ZIP_BOMB');
    }
    const name = buffer.subarray(nameStart, nameEnd).toString('utf8');
    if (!isSafeZipPath(name)) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
    if (names.has(name)) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
    names.add(name);
    const dataEnd = dataStart + compressedSize;
    entries.push({
      name,
      compressed: buffer.subarray(dataStart, dataEnd),
      uncompressedSize,
      compression,
    });
    offset = dataEnd;
  }
  if (entries.length === 0) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  return Object.freeze({ accepted: true, value: Object.freeze(entries) });
}

function isSafeZipPath(name: string): boolean {
  return (
    name.length > 0 &&
    !name.startsWith('/') &&
    !name.includes('\\') &&
    !name.includes('\0') &&
    !name.split('/').some((part) => part === '..' || part.length === 0)
  );
}

export function inflateRawBoundedV1(
  compressed: Uint8Array,
  maxOutputLength: number,
): WebIntakeResultV1<Buffer> {
  try {
    return Object.freeze({
      accepted: true,
      value: inflateRawSync(compressed, { maxOutputLength }),
    });
  } catch {
    return rejected('DDA_INTAKE_ZIP_BOMB');
  }
}

function inflateEntry(entry: ZipLocalEntry, maxOutputLength: number): WebIntakeResultV1<Buffer> {
  if (entry.compression === 0) {
    if (
      entry.compressed.length > maxOutputLength ||
      entry.uncompressedSize !== entry.compressed.length
    ) {
      return rejected('DDA_INTAKE_ZIP_BOMB');
    }
    return Object.freeze({ accepted: true, value: Buffer.from(entry.compressed) });
  }
  if (entry.compression !== 8) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  const inflated = inflateRawBoundedV1(entry.compressed, maxOutputLength);
  if (!inflated.accepted) return inflated;
  if (inflated.value.length !== entry.uncompressedSize) return rejected('DDA_INTAKE_ZIP_BOMB');
  return inflated;
}

interface XmlInspectionV1 {
  readonly nodeCount: number;
  readonly cellCount: number;
  readonly maxRow: number;
  readonly maxColumn: number;
  readonly formulaCount: number;
}

function excelColumnNumber(label: string): number | undefined {
  if (!/^[A-Z]+$/u.test(label)) return undefined;
  let number = 0;
  for (const character of label) {
    number = number * 26 + character.charCodeAt(0) - 64;
    if (number > 16_384) return undefined;
  }
  return number;
}

function inspectXml(xml: string, isWorksheet: boolean): WebIntakeResultV1<XmlInspectionV1> {
  if (/<!DOCTYPE|<!ENTITY|\bSYSTEM\b|\bPUBLIC\b/iu.test(xml)) {
    return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  }
  const stack: string[] = [];
  let nodeCount = 0;
  let cellCount = 0;
  let maxRow = 0;
  let maxColumn = 0;
  let formulaCount = 0;
  const token =
    /<!--[\s\S]*?-->|<\?[^?]*\?>|<(?<closing>\/)?(?<name>[A-Za-z_][\w:.-]*)(?<attributes>[^<>]*?)(?<selfClosing>\/)?\s*>/gu;
  let cursor = 0;
  for (const match of xml.matchAll(token)) {
    const index = match.index ?? 0;
    const gap = xml.slice(cursor, index);
    if (gap.includes('<')) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
    cursor = index + match[0].length;
    if (match[0].startsWith('<!--') || match[0].startsWith('<?')) continue;
    nodeCount += 1;
    if (nodeCount > DDA_WEB_INTAKE_PROFILE_V1.limits.maxXmlNodes) {
      return rejected('DDA_INTAKE_ZIP_BOMB');
    }
    const name = match.groups?.['name'];
    const closing = match.groups?.['closing'] === '/';
    const selfClosing = match.groups?.['selfClosing'] === '/';
    if (!name) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
    if (closing) {
      if (stack.pop() !== name) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
      continue;
    }
    if (!selfClosing) stack.push(name);
    const attributes = match.groups?.['attributes'] ?? '';
    if (isWorksheet && name === 'c') {
      cellCount += 1;
      if (cellCount > DDA_WEB_INTAKE_PROFILE_V1.limits.maxCells) {
        return rejected('DDA_INTAKE_ZIP_BOMB');
      }
      const reference = /\br\s*=\s*["']([A-Z]+)(\d+)["']/u.exec(attributes);
      if (!reference) continue;
      const column = excelColumnNumber(reference[1] ?? '');
      const row = Number(reference[2] ?? '0');
      if (column === undefined || !Number.isSafeInteger(row) || row < 1) {
        return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
      }
      maxColumn = Math.max(maxColumn, column);
      maxRow = Math.max(maxRow, row);
    }
    if (isWorksheet && name === 'f') formulaCount += 1;
  }
  if (xml.slice(cursor).includes('<') || stack.length > 0) {
    return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({ nodeCount, cellCount, maxRow, maxColumn, formulaCount }),
  });
}

function inspectXlsx(bytes: Uint8Array): WebIntakeResultV1<{ readonly kind: 'XLSX' }> {
  if (bytes.length > DDA_WEB_INTAKE_PROFILE_V1.limits.maxBytes)
    return rejected('DDA_INTAKE_LIMIT_SIZE');
  const entries = readZipEntries(bytes);
  if (!entries.accepted) return entries;
  if (entries.value.some((entry) => entry.name.toLowerCase().includes('vbaproject.bin'))) {
    return rejected('DDA_INTAKE_MACRO_ENABLED');
  }
  if (entries.value.some((entry) => entry.name.toLowerCase().includes('externallinks/'))) {
    return rejected('DDA_INTAKE_EXTERNAL_LINK');
  }
  const sheets = entries.value.filter((entry) =>
    /xl\/worksheets\/sheet\d+\.xml$/iu.test(entry.name),
  );
  if (sheets.length === 0) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  if (sheets.length > DDA_WEB_INTAKE_PROFILE_V1.limits.maxSheets) {
    return rejected('DDA_INTAKE_LIMIT_SHEETS');
  }
  let formulaCount = 0;
  let maxColumns = 0;
  let maxRows = 0;
  let totalXmlNodes = 0;
  let totalCells = 0;
  let totalUncompressed = 0;
  const inflatedEntries = new Map<string, Buffer>();
  for (const entry of entries.value) {
    const remaining = DDA_WEB_INTAKE_PROFILE_V1.limits.maxZipUncompressedBytes - totalUncompressed;
    if (remaining <= 0) return rejected('DDA_INTAKE_ZIP_BOMB');
    const inflated = inflateEntry(
      entry,
      Math.min(DDA_WEB_INTAKE_PROFILE_V1.limits.maxZipEntryBytes, remaining),
    );
    if (!inflated.accepted) return inflated;
    totalUncompressed += inflated.value.length;
    if (totalUncompressed > DDA_WEB_INTAKE_PROFILE_V1.limits.maxZipUncompressedBytes) {
      return rejected('DDA_INTAKE_ZIP_BOMB');
    }
    inflatedEntries.set(entry.name, inflated.value);
  }
  for (const sheet of sheets) {
    const inflated = inflatedEntries.get(sheet.name);
    if (!inflated) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
    let xml: string;
    try {
      xml = new TextDecoder('utf-8', { fatal: true }).decode(inflated);
    } catch {
      return rejected('DDA_INTAKE_MALFORMED_ENCODING');
    }
    const inspected = inspectXml(xml, true);
    if (!inspected.accepted) return inspected;
    formulaCount += inspected.value.formulaCount;
    maxColumns = Math.max(maxColumns, inspected.value.maxColumn);
    maxRows = Math.max(maxRows, inspected.value.maxRow);
    totalXmlNodes += inspected.value.nodeCount;
    totalCells += inspected.value.cellCount;
    if (totalXmlNodes > DDA_WEB_INTAKE_PROFILE_V1.limits.maxXmlNodes) {
      return rejected('DDA_INTAKE_ZIP_BOMB');
    }
    if (totalCells > DDA_WEB_INTAKE_PROFILE_V1.limits.maxCells) {
      return rejected('DDA_INTAKE_ZIP_BOMB');
    }
    if (inspected.value.maxColumn > DDA_WEB_INTAKE_PROFILE_V1.limits.maxXmlColumns) {
      return rejected('DDA_INTAKE_LIMIT_COLUMNS');
    }
    if (inspected.value.maxRow > DDA_WEB_INTAKE_PROFILE_V1.limits.maxXmlRows) {
      return rejected('DDA_INTAKE_LIMIT_ROWS');
    }
  }
  for (const [name, inflated] of inflatedEntries) {
    if (sheets.some((sheet) => sheet.name === name)) continue;
    if (!name.toLowerCase().endsWith('.xml') && !name.toLowerCase().endsWith('.rels')) continue;
    let xml: string;
    try {
      xml = new TextDecoder('utf-8', { fatal: true }).decode(inflated);
    } catch {
      return rejected('DDA_INTAKE_MALFORMED_ENCODING');
    }
    if (
      name.toLowerCase().endsWith('.rels') &&
      (/TargetMode\s*=\s*["']External["']/iu.test(xml) ||
        /Target\s*=\s*["'](?:[a-z][a-z\d+.-]*:|\/\/|\/)/iu.test(xml))
    ) {
      return rejected('DDA_INTAKE_EXTERNAL_LINK');
    }
    const inspected = inspectXml(xml, false);
    if (!inspected.accepted) return inspected;
    totalXmlNodes += inspected.value.nodeCount;
    if (totalXmlNodes > DDA_WEB_INTAKE_PROFILE_V1.limits.maxXmlNodes) {
      return rejected('DDA_INTAKE_ZIP_BOMB');
    }
  }
  if (formulaCount > DDA_WEB_INTAKE_PROFILE_V1.limits.maxFormulas) {
    return rejected('DDA_INTAKE_FORMULA_LIMIT');
  }
  if (maxColumns > DDA_WEB_INTAKE_PROFILE_V1.limits.maxColumns) {
    return rejected('DDA_INTAKE_LIMIT_COLUMNS');
  }
  if (maxRows > DDA_WEB_INTAKE_PROFILE_V1.limits.maxRows) {
    return rejected('DDA_INTAKE_LIMIT_ROWS');
  }
  return Object.freeze({ accepted: true, value: Object.freeze({ kind: 'XLSX' as const }) });
}

/** DDA-002: govern Web CSV/XLSX intake against published profile and IAE finalization. */
export class WebIntakeServiceV1 {
  public constructor(
    private readonly iae: IntakeIaeFinalizationPortV1,
    private readonly upload?: IntakeIaeUploadPortV1,
  ) {}

  public publishedProfile(): DdaWebIntakeProfileV1 {
    return DDA_WEB_INTAKE_PROFILE_V1;
  }

  public async finalizeUpload(
    input: WebIntakeFinalizeInputV1,
  ): Promise<WebIntakeResultV1<WebIntakeFinalizeValueV1>> {
    if (sha256Hex(input.bytes) !== input.expectedSha256.toLowerCase()) {
      return rejected('DDA_INTAKE_CHECKSUM_MISMATCH');
    }
    const media = input.claimedMediaType.toLowerCase();
    const inspection =
      media === 'text/csv' || input.fileName.toLowerCase().endsWith('.csv')
        ? inspectCsv(input.bytes, input.declaredEncoding)
        : media === XLSX_MEDIA || input.fileName.toLowerCase().endsWith('.xlsx')
          ? inspectXlsx(input.bytes)
          : rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
    if (!inspection.accepted) return inspection;

    const finalized = await this.iae.finalizeSession({
      tenantScope: input.tenantScope,
      sessionId: input.sessionId,
      expectedSha256: input.expectedSha256.toLowerCase(),
      byteSize: input.bytes.byteLength,
      mediaType: media === 'text/csv' ? 'text/csv' : XLSX_MEDIA,
    });
    if (!finalized.accepted) return finalized;
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        sessionId: finalized.value.sessionId,
        artifactVersionId: finalized.value.artifactVersionId,
        status: 'FINALIZED' as const,
        profileId: 'dda.web.tabular.v1' as const,
      }),
    });
  }

  public async uploadFile(
    input: WebIntakeUploadInputV1,
    context: IamTenantContextV1,
  ): Promise<
    | {
        readonly accepted: true;
        readonly value: {
          readonly sessionId: string;
          readonly artifactVersionId: string;
          readonly status: 'PENDING_REVIEW';
          readonly profileId: 'dda.web.tabular.v1';
          readonly replayed: boolean;
        };
      }
    | { readonly accepted: false; readonly code: DdaIntakeProblemCodeV1 }
  > {
    if (this.upload === undefined) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
    if (context.tenantScope.scopeType !== 'workspace' || context.actorId === undefined) {
      return rejected('DDA_INTAKE_LOCAL_PERMISSION_DENIED');
    }
    if (sha256Hex(input.bytes) !== input.expectedSha256.toLowerCase()) {
      return rejected('DDA_INTAKE_CHECKSUM_MISMATCH');
    }
    const media = input.claimedMediaType.toLowerCase();
    const inspection =
      media === 'text/csv' || input.fileName.toLowerCase().endsWith('.csv')
        ? inspectCsv(input.bytes, input.declaredEncoding)
        : media === XLSX_MEDIA || input.fileName.toLowerCase().endsWith('.xlsx')
          ? inspectXlsx(input.bytes)
          : rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
    if (!inspection.accepted) return inspection;
    const uploadInput: LocalWebIntakeUploadInputV1 = {
      tenantScope: input.tenantScope,
      fileName: input.fileName,
      mediaType: media === 'text/csv' ? 'text/csv' : XLSX_MEDIA,
      expectedSha256: input.expectedSha256.toLowerCase(),
      bytes: input.bytes,
      idempotencyKey: input.idempotencyKey,
    };
    const uploaded = await this.upload.upload(context, uploadInput);
    if (!uploaded.accepted) {
      const code: DdaIntakeProblemCodeV1 =
        uploaded.code === 'LOCAL_INTAKE_PERMISSION_DENIED'
          ? 'DDA_INTAKE_LOCAL_PERMISSION_DENIED'
          : uploaded.code === 'LOCAL_INTAKE_POLICY_UNAVAILABLE'
            ? 'DDA_INTAKE_LOCAL_POLICY_UNAVAILABLE'
            : uploaded.code === 'LOCAL_INTAKE_DATA_MODE_DENIED'
              ? 'DDA_INTAKE_LOCAL_DATA_MODE_DENIED'
              : uploaded.code === 'LOCAL_INTAKE_IDEMPOTENCY_CONFLICT'
                ? 'DDA_INTAKE_LOCAL_IDEMPOTENCY_CONFLICT'
                : uploaded.code === 'LOCAL_INTAKE_INVALID_INPUT'
                  ? 'DDA_INTAKE_CHECKSUM_MISMATCH'
                  : 'DDA_INTAKE_LOCAL_UNAVAILABLE';
      return rejected(code);
    }
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        sessionId: uploaded.value.sessionId,
        artifactVersionId: uploaded.value.artifactVersionId,
        status: 'PENDING_REVIEW' as const,
        profileId: 'dda.web.tabular.v1' as const,
        replayed: uploaded.value.replayed,
      }),
    });
  }
}
