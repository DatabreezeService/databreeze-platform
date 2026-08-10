import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  DDA_WEB_INTAKE_PROFILE_V1,
  type DdaIntakeProblemCodeV1,
  type DdaWebIntakeProfileV1,
  type IntakeIaeFinalizationPortV1,
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

function decodeCsv(
  bytes: Uint8Array,
  declaredEncoding: string | undefined,
): WebIntakeResultV1<string> {
  const encoding = (declaredEncoding ?? 'utf-8').toLowerCase();
  if (!DDA_WEB_INTAKE_PROFILE_V1.csv.encodings.includes(encoding)) {
    return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  }
  if (encoding === 'utf-8' || encoding === 'utf-8-sig') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return Object.freeze({ accepted: true, value: text });
    } catch {
      return rejected('DDA_INTAKE_MALFORMED_ENCODING');
    }
  }
  // windows-1258: accept only if no invalid UTF-8 BOM/UTF16 markers present
  if (
    bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
  ) {
    return rejected('DDA_INTAKE_MALFORMED_ENCODING');
  }
  return Object.freeze({ accepted: true, value: Buffer.from(bytes).toString('latin1') });
}

function inspectCsv(
  bytes: Uint8Array,
  declaredEncoding?: string,
): WebIntakeResultV1<{ readonly kind: 'CSV' }> {
  if (looksLikeExecutable(bytes)) return rejected('DDA_INTAKE_RENAMED_EXECUTABLE');
  if (bytes.length > DDA_WEB_INTAKE_PROFILE_V1.limits.maxBytes)
    return rejected('DDA_INTAKE_LIMIT_SIZE');
  const decoded = decodeCsv(bytes, declaredEncoding);
  if (!decoded.accepted) return decoded;
  const lines = decoded.value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line, index, all) => {
      return !(index === all.length - 1 && line === '');
    });
  if (lines.length === 0) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  const headerColumns = lines[0]?.split(',').length ?? 0;
  if (headerColumns > DDA_WEB_INTAKE_PROFILE_V1.limits.maxColumns) {
    return rejected('DDA_INTAKE_LIMIT_COLUMNS');
  }
  const dataRows = Math.max(0, lines.length - 1);
  if (dataRows > DDA_WEB_INTAKE_PROFILE_V1.limits.maxRows) return rejected('DDA_INTAKE_LIMIT_ROWS');
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
  let offset = 0;
  let totalUncompressed = 0;
  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
    totalUncompressed += uncompressedSize;
    if (
      totalUncompressed > DDA_WEB_INTAKE_PROFILE_V1.limits.maxBytes * 8 ||
      (compressedSize > 0 && uncompressedSize / compressedSize > 40)
    ) {
      return rejected('DDA_INTAKE_ZIP_BOMB');
    }
    entries.push({
      name: buffer.subarray(nameStart, nameEnd).toString('utf8'),
      compressed: buffer.subarray(dataStart, dataEnd),
      uncompressedSize,
      compression,
    });
    offset = dataEnd;
  }
  if (entries.length === 0) return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  return Object.freeze({ accepted: true, value: Object.freeze(entries) });
}

function inflateEntry(entry: ZipLocalEntry): WebIntakeResultV1<Buffer> {
  try {
    if (entry.compression === 0) {
      return Object.freeze({ accepted: true, value: Buffer.from(entry.compressed) });
    }
    if (entry.compression === 8) {
      const inflated = inflateRawSync(entry.compressed);
      if (inflated.length !== entry.uncompressedSize) return rejected('DDA_INTAKE_ZIP_BOMB');
      return Object.freeze({ accepted: true, value: inflated });
    }
    return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  } catch {
    return rejected('DDA_INTAKE_UNSUPPORTED_PROFILE');
  }
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
  if (sheets.length > DDA_WEB_INTAKE_PROFILE_V1.limits.maxSheets) {
    return rejected('DDA_INTAKE_LIMIT_SHEETS');
  }
  let formulaCount = 0;
  let maxColumns = 0;
  let maxRows = 0;
  for (const sheet of sheets) {
    const inflated = inflateEntry(sheet);
    if (!inflated.accepted) return inflated;
    const xml = inflated.value.toString('utf8');
    const formulas = xml.match(/<f[\s>]/giu) ?? [];
    formulaCount += formulas.length;
    const cells = xml.match(/r="([A-Z]+)(\d+)"/gu) ?? [];
    for (const cell of cells) {
      const match = /r="([A-Z]+)(\d+)"/u.exec(cell);
      if (!match) continue;
      const col = match[1] ?? 'A';
      const row = Number(match[2] ?? '0');
      maxColumns = Math.max(maxColumns, col.length === 1 ? col.charCodeAt(0) - 64 : 27);
      maxRows = Math.max(maxRows, row);
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
  public constructor(private readonly iae: IntakeIaeFinalizationPortV1) {}

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
}
