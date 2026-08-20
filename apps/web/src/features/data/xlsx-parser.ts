import { TabularParseError } from './csv-parser.ts';

/**
 * Minimal native XLSX reader (DDA-053): unzip via DecompressionStream, read the
 * first worksheet with DOMParser, and emit a raw string grid for the shared
 * tabular inference pipeline. Supports shared/inline strings, numbers,
 * booleans, and styled serial dates. No third-party dependencies.
 */

class XlsxError extends TabularParseError {}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

type RawInflateStreamCtor = new (format: 'deflate-raw') => TransformStream<Uint8Array, Uint8Array>;

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DecompressionStreamCtor = globalThis.DecompressionStream as
    | RawInflateStreamCtor
    | undefined;
  if (DecompressionStreamCtor === undefined) {
    throw new XlsxError('NOT_XLSX', 'DecompressionStream is unavailable in this runtime');
  }
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let eocd = -1;
  for (let index = bytes.byteLength - 22; index >= 0; index--) {
    if (readU32(view, index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError('NOT_XLSX');

  const entryCount = readU16(view, eocd + 10);
  let offset = readU32(view, eocd + 16);
  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();

  for (let index = 0; index < entryCount; index++) {
    if (readU32(view, offset) !== 0x02014b50) throw new XlsxError('NOT_XLSX');
    const method = readU16(view, offset + 10);
    const compressedSize = readU32(view, offset + 20);
    const uncompressedSize = readU32(view, offset + 24);
    const nameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const localOffset = readU32(view, offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (readU32(view, localOffset) === 0x04034b50) {
      const localNameLength = readU16(view, localOffset + 26);
      const localExtraLength = readU16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) {
        entries.set(name, data.slice());
      } else if (method === 8) {
        entries.set(name, await inflateRaw(data));
        if (entries.get(name)!.byteLength !== uncompressedSize) {
          throw new XlsxError('NOT_XLSX', `corrupt entry ${name}`);
        }
      } else {
        throw new XlsxError('NOT_XLSX', `unsupported compression method ${method}`);
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function xmlText(bytes: Uint8Array): Document {
  const text = new TextDecoder('utf-8').decode(bytes);
  const parser = new DOMParser();
  const document = parser.parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new XlsxError('NOT_XLSX', 'malformed xml part');
  }
  return document;
}

function firstSheetPath(entries: Map<string, Uint8Array>): string {
  const workbook = xmlText(entries.get('xl/workbook.xml')!);
  const sheet = workbook.getElementsByTagName('sheet')[0];
  const relsBytes = entries.get('xl/_rels/workbook.xml.rels');
  if (sheet && relsBytes) {
    const relId =
      sheet.getAttribute('r:id') ??
      sheet.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id',
      );
    if (relId) {
      const rels = xmlText(relsBytes);
      for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
        if (rel.getAttribute('Id') === relId) {
          const target = rel.getAttribute('Target') ?? '';
          const normalized = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
          if (entries.has(normalized)) return normalized;
        }
      }
    }
  }
  const fallback = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(name))
    .sort();
  const first = fallback[0];
  if (first === undefined) throw new XlsxError('NO_SHEET');
  return first;
}

function columnIndex(reference: string): number {
  let index = 0;
  for (const char of reference) {
    if (char >= 'A' && char <= 'Z') index = index * 26 + (char.charCodeAt(0) - 64);
    else if (char >= 'a' && char <= 'z') index = index * 26 + (char.charCodeAt(0) - 96);
    else break;
  }
  return index - 1;
}

const DATE_BUILTIN_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function dateStyleIndexes(entries: Map<string, Uint8Array>): Set<number> {
  const styles = entries.get('xl/styles.xml');
  const result = new Set<number>();
  if (!styles) return result;
  const document = xmlText(styles);
  const customDateFormats = new Map<number, boolean>();
  for (const numFmt of Array.from(document.getElementsByTagName('numFmt'))) {
    const id = Number(numFmt.getAttribute('numFmtId'));
    const code = numFmt.getAttribute('formatCode') ?? '';
    const significant = code.replace(/"[^"]*"|'[^']*'|\[[^\]]*\]|\\./gu, '');
    if (Number.isFinite(id) && /[dmyhs]/iu.test(significant) && !/[#0]/u.test(significant)) {
      customDateFormats.set(id, true);
    }
  }
  const cellXfs = document.getElementsByTagName('cellXfs')[0];
  if (cellXfs === undefined) return result;
  Array.from(cellXfs.getElementsByTagName('xf')).forEach((xf, index) => {
    const numFmtId = Number(xf.getAttribute('numFmtId'));
    if (DATE_BUILTIN_FORMATS.has(numFmtId) || customDateFormats.get(numFmtId) === true) {
      result.add(index);
    }
  });
  return result;
}

function excelSerialToDateString(serial: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  const milliseconds = epoch + serial * 86_400_000;
  const date = new Date(milliseconds);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const timePart = serial % 1;
  if (timePart > 0) {
    const totalSeconds = Math.round(timePart * 86_400);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hours}:${minutes}`;
  }
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Parse an XLSX workbook into its raw first-sheet string grid (header row first).
 * Number/date conventions are intentionally left to the shared inference pass.
 */
export async function parseXlsxContent(fileName: string, bytes: ArrayBuffer): Promise<string[][]> {
  const entries = await readZip(new Uint8Array(bytes));
  const sheetPath = firstSheetPath(entries);
  const sheet = xmlText(entries.get(sheetPath)!);
  const dateStyles = dateStyleIndexes(entries);

  const sharedStrings: string[] = [];
  const sharedBytes = entries.get('xl/sharedStrings.xml');
  if (sharedBytes) {
    const shared = xmlText(sharedBytes);
    for (const si of Array.from(shared.getElementsByTagName('si'))) {
      sharedStrings.push(
        Array.from(si.getElementsByTagName('t'))
          .map((t) => t.textContent ?? '')
          .join(''),
      );
    }
  }

  const grid: string[][] = [];
  for (const row of Array.from(sheet.getElementsByTagName('row'))) {
    const cells: string[] = [];
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const reference = cell.getAttribute('r') ?? '';
      const colIndex = reference ? columnIndex(reference) : cells.length;
      const type = cell.getAttribute('t');
      const valueNode = cell.getElementsByTagName('v')[0];
      const raw = valueNode?.textContent ?? '';

      let value = '';
      if (type === 'inlineStr') {
        value = Array.from(cell.getElementsByTagName('t'))
          .map((t) => t.textContent ?? '')
          .join('');
      } else if (type === 's') {
        value = sharedStrings[Number(raw)] ?? '';
      } else if (type === 'b') {
        value = raw === '1' ? 'TRUE' : 'FALSE';
      } else if (type === 'str' || raw === '') {
        value = raw;
      } else {
        const styleIndex = Number(cell.getAttribute('s') ?? '-1');
        const numeric = Number(raw);
        if (
          Number.isFinite(numeric) &&
          numeric > 20 &&
          numeric < 80_000 &&
          dateStyles.has(styleIndex)
        ) {
          value = excelSerialToDateString(numeric);
        } else {
          value = raw;
        }
      }

      while (cells.length < colIndex) cells.push('');
      cells[colIndex] = value;
    }
    if (cells.some((value) => value !== '')) grid.push(cells);
  }

  if (grid.length === 0) throw new XlsxError('EMPTY_FILE', fileName);
  return grid;
}
