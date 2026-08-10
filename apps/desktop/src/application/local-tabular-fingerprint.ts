import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import type { FolderFingerprintResult } from './folder-intake.service.ts';

const MAX_BYTES = 512_000;

interface ZipEntry {
  readonly name: string;
  readonly compression: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

function readU16(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset);
}

function readU32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

function parseCentralDirectory(buffer: Buffer): ZipEntry[] | null {
  if (buffer.length < 22 || buffer.subarray(0, 2).toString('binary') !== 'PK') return null;
  let end = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index -= 1) {
    if (
      buffer[index] === 0x50 &&
      buffer[index + 1] === 0x4b &&
      buffer[index + 2] === 0x05 &&
      buffer[index + 3] === 0x06
    ) {
      end = index;
      break;
    }
  }
  if (end < 0) return null;
  const entryCount = readU16(buffer, end + 10);
  const directorySize = readU32(buffer, end + 12);
  const directoryOffset = readU32(buffer, end + 16);
  if (directoryOffset + directorySize > buffer.length) return null;

  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length) return null;
    if (readU32(buffer, cursor) !== 0x02014b50) return null;
    const compression = readU16(buffer, cursor + 10);
    const compressedSize = readU32(buffer, cursor + 20);
    const uncompressedSize = readU32(buffer, cursor + 24);
    const nameLength = readU16(buffer, cursor + 28);
    const extraLength = readU16(buffer, cursor + 30);
    const commentLength = readU16(buffer, cursor + 32);
    const localHeaderOffset = readU32(buffer, cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) return null;
    const name = buffer.subarray(nameStart, nameEnd).toString('utf8');
    entries.push({
      name,
      compression,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor = nameEnd + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer | null {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || readU32(buffer, offset) !== 0x04034b50) return null;
  const nameLength = readU16(buffer, offset + 26);
  const extraLength = readU16(buffer, offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) return null;
  const compressed = buffer.subarray(dataStart, dataEnd);
  if (entry.compression === 0) return Buffer.from(compressed);
  if (entry.compression === 8) {
    try {
      return inflateRawSync(compressed);
    } catch {
      return null;
    }
  }
  return null;
}

function fingerprintCsv(content: Buffer): FolderFingerprintResult {
  if (content.length > MAX_BYTES) return { rejected: 'UNSUPPORTED_PROFILE' };
  if (content.length >= 2 && content[0] === 0x4d && content[1] === 0x5a) {
    return { rejected: 'UNSUPPORTED_PROFILE' };
  }
  const header = content.toString('utf8').split(/\r?\n/u, 1)[0]?.trim();
  if (header === undefined || header === '') return { rejected: 'MALFORMED_CONTENT' };
  return {
    accepted: true,
    contentFingerprint: `sha256:${createHash('sha256').update(content).digest('hex')}`,
    schemaFingerprint: createHash('sha256').update(header).digest('hex'),
    profile: 'CSV',
  };
}

function extractXlsxHeader(sheetXml: string): string | null {
  const rowMatch = /<row[^>]*>([\s\S]*?)<\/row>/u.exec(sheetXml);
  if (rowMatch === null) return null;
  const rowBody = rowMatch[1] ?? '';
  const values = [...rowBody.matchAll(/<v>([^<]*)<\/v>/gu)].map((match) => match[1] ?? '');
  if (values.length === 0) return null;
  return values.join(',');
}

function fingerprintXlsx(content: Buffer): FolderFingerprintResult {
  if (content.length > MAX_BYTES) return { rejected: 'UNSUPPORTED_PROFILE' };
  const entries = parseCentralDirectory(content);
  if (entries === null) return { rejected: 'MALFORMED_CONTENT' };

  const names = entries.map((entry) => entry.name.toLowerCase());
  if (names.some((name) => name.includes('encryptedpackage') || name.includes('encryptioninfo'))) {
    return { rejected: 'PROTECTED_CONTENT' };
  }
  if (names.some((name) => name.includes('vbaproject.bin'))) {
    return { rejected: 'MACRO_ENABLED' };
  }
  if (names.some((name) => name.includes('externallinks/'))) {
    return { rejected: 'EXTERNAL_LINK' };
  }
  if (!names.some((name) => name.endsWith('xl/workbook.xml'))) {
    return { rejected: 'MALFORMED_CONTENT' };
  }

  const sheetEntry =
    entries.find((entry) => /xl\/worksheets\/sheet1\.xml$/iu.test(entry.name)) ??
    entries.find((entry) => /xl\/worksheets\/sheet\d+\.xml$/iu.test(entry.name));
  if (sheetEntry === undefined) return { rejected: 'MALFORMED_CONTENT' };
  const sheetXml = readZipEntry(content, sheetEntry)?.toString('utf8');
  if (sheetXml === undefined) return { rejected: 'MALFORMED_CONTENT' };
  const header = extractXlsxHeader(sheetXml);
  if (header === null) return { rejected: 'MALFORMED_CONTENT' };

  return {
    accepted: true,
    contentFingerprint: `sha256:${createHash('sha256').update(content).digest('hex')}`,
    schemaFingerprint: createHash('sha256').update(header).digest('hex'),
    profile: 'XLSX',
  };
}

export function fingerprintLocalTabularFile(
  filePath: string,
  content: Buffer,
): FolderFingerprintResult {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.csv')) return fingerprintCsv(content);
  if (lower.endsWith('.xlsx')) return fingerprintXlsx(content);
  return { rejected: 'UNSUPPORTED_PROFILE' };
}
