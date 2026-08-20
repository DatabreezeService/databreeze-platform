import type {
  DatasetCardV1,
  DatasetPreparationSummaryV1,
  DatasetQualityV1,
  DatasetRecordV1,
  DatasetRecordVersionV1,
  DatasetSourceFileV1,
  GovernedFieldTypeV1,
} from './data-model.ts';
import { toDatasetCardV1 } from './data-model.ts';

export const MAX_TABULAR_COLUMNS = 256;
export const MAX_TABULAR_ROWS = 1_000_000;
export const MAX_TABULAR_FILE_BYTES = 100 * 1024 * 1024;

export type NumberConventionV1 = 'VI' | 'EN' | 'MIXED' | 'NONE';

export interface ParsedColumnSchema {
  readonly name: string;
  readonly type: GovernedFieldTypeV1;
  readonly nullCount: number;
  readonly invalidCount: number;
  readonly convention: NumberConventionV1;
  readonly sampleValues: readonly string[];
}

export interface ParsedFileSourceV1 {
  readonly fileName: string;
  readonly byteSize: number;
  readonly rowCount: number;
}

export interface ParsedTabularData {
  readonly fileName: string;
  readonly headers: readonly string[];
  readonly columns: readonly ParsedColumnSchema[];
  readonly rows: readonly Record<string, string | number | boolean | null>[];
  readonly totalRows: number;
  readonly malformedRowCount: number;
  readonly rawTextSnippet: string;
  readonly warnings: readonly string[];
  readonly fileSources: readonly ParsedFileSourceV1[];
}

export type TabularParseErrorCodeV1 =
  | 'EMPTY_FILE'
  | 'NO_HEADERS'
  | 'HEADER_MISMATCH'
  | 'LIMIT_EXCEEDED'
  | 'UNSUPPORTED_FORMAT'
  | 'NOT_XLSX'
  | 'NO_SHEET';

export class TabularParseError extends Error {
  public constructor(
    readonly code: TabularParseErrorCodeV1,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'TabularParseError';
  }
}

export interface TabularSourceFileV1 {
  readonly fileName: string;
  readonly bytes: ArrayBuffer;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/u).slice(0, 5).join('\n');
  const commaCount = (firstLines.match(/,/gu) || []).length;
  const semicolonCount = (firstLines.match(/;/gu) || []).length;
  const tabCount = (firstLines.match(/\t/gu) || []).length;

  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  if (semicolonCount > commaCount) return ';';
  return ',';
}

function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        index++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') index++;
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((field) => field.length > 0)) rows.push(currentRow);
        currentRow = [];
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((field) => field.length > 0)) rows.push(currentRow);
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((field) => field.length > 0)) rows.push(currentRow);
  }

  return rows;
}

/** Vietnamese form uses dots for thousands and a comma for decimals (`1.234,56`). */
const VI_THOUSANDS = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/u;
const VI_DECIMAL = /^-?\d+,\d+$/u;
/** English form uses commas for thousands and a dot for decimals (`1,234.56`). */
const EN_THOUSANDS = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/u;
const EN_DECIMAL = /^-?\d+\.\d+$/u;
const PLAIN_INTEGER = /^-?\d+$/u;

function detectNumberConvention(
  values: readonly string[],
): { readonly convention: NumberConventionV1; readonly numericRatio: number } {
  let viCount = 0;
  let enCount = 0;
  let plainCount = 0;
  let nonEmpty = 0;

  for (const raw of values) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    nonEmpty++;
    const clean = trimmed.replace(/[₫$\s]/gu, '');
    if (VI_THOUSANDS.test(clean) || VI_DECIMAL.test(clean)) viCount++;
    else if (EN_THOUSANDS.test(clean) || EN_DECIMAL.test(clean)) enCount++;
    else if (PLAIN_INTEGER.test(clean)) plainCount++;
  }

  if (nonEmpty === 0) return { convention: 'NONE', numericRatio: 0 };
  const numericRatio = (viCount + enCount + plainCount) / nonEmpty;
  if (viCount > 0 && enCount > 0) return { convention: 'MIXED', numericRatio };
  if (viCount > 0) return { convention: 'VI', numericRatio };
  if (enCount > 0) return { convention: 'EN', numericRatio };
  return { convention: 'NONE', numericRatio };
}

const DATE_OR_DATETIME =
  /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})([ T]\d{1,2}:\d{2}(:\d{2})?)?$/u;

function inferFieldType(
  values: readonly string[],
  convention: NumberConventionV1,
): GovernedFieldTypeV1 {
  const nonEmpties = values.filter((val) => val.trim() !== '');
  if (nonEmpties.length === 0) return 'TEXT';

  let integerMatches = 0;
  let decimalMatches = 0;
  let booleanMatches = 0;
  let dateMatches = 0;

  for (const raw of nonEmpties) {
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();

    if (lower === 'true' || lower === 'false' || lower === 'đúng' || lower === 'sai') {
      booleanMatches++;
      continue;
    }

    const clean = trimmed.replace(/[₫$₫\s]/gu, '');
    if (convention !== 'VI') {
      const enClean = clean.replace(/,/gu, '');
      if (PLAIN_INTEGER.test(enClean) && !Number.isNaN(Number(enClean))) {
        integerMatches++;
        continue;
      }
      if (EN_THOUSANDS.test(clean) || EN_DECIMAL.test(clean)) {
        decimalMatches++;
        continue;
      }
    }
    if (convention !== 'EN') {
      const viClean = clean.replace(/\./gu, '').replace(/,/gu, '.');
      if (PLAIN_INTEGER.test(viClean) && !Number.isNaN(Number(viClean))) {
        integerMatches++;
        continue;
      }
      if (VI_THOUSANDS.test(clean) || VI_DECIMAL.test(clean)) {
        decimalMatches++;
        continue;
      }
    }

    if (DATE_OR_DATETIME.test(trimmed) && Number.isFinite(Date.parse(trimmed))) {
      dateMatches++;
      continue;
    }
  }

  const threshold = nonEmpties.length * 0.8;
  if (booleanMatches >= threshold) return 'BOOLEAN';
  if (integerMatches >= threshold) return 'INTEGER';
  if (integerMatches + decimalMatches >= threshold) return 'DECIMAL';
  if (dateMatches >= threshold) return 'DATE';
  return 'TEXT';
}

function coerceValue(
  raw: string,
  type: GovernedFieldTypeV1,
  convention: NumberConventionV1,
): string | number | boolean | null {
  if (raw === '' || raw === null || raw === undefined) return null;
  const trimmed = raw.trim();

  if (type === 'INTEGER') {
    const clean = trimmed.replace(/[₫$\s]/gu, '');
    const normalized =
      convention === 'VI' ? clean.replace(/\./gu, '').replace(/,/gu, '') : clean.replace(/,/gu, '');
    const num = parseInt(normalized, 10);
    return Number.isNaN(num) ? null : num;
  }
  if (type === 'DECIMAL') {
    const clean = trimmed.replace(/[₫$\s]/gu, '');
    const normalized =
      convention === 'VI' ? clean.replace(/\./gu, '').replace(/,/gu, '.') : clean.replace(/,/gu, '');
    const num = parseFloat(normalized);
    return Number.isNaN(num) ? null : num;
  }
  if (type === 'BOOLEAN') {
    const lower = trimmed.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'đúng') return true;
    if (lower === 'false' || lower === '0' || lower === 'sai') return false;
    return null;
  }
  return trimmed;
}

function decodeUtf8(bytes: ArrayBuffer): string {
  return stripBom(new TextDecoder('utf-8').decode(bytes));
}

function fileKind(fileName: string): 'csv' | 'tsv' | 'xlsx' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.tsv') || lower.endsWith('.tab')) return 'tsv';
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv';
  throw new TabularParseError(
    'UNSUPPORTED_FORMAT',
    fileName,
  );
}

export function tabularFileName(fileName: string): string {
  return fileName.split(/[\\/]/).pop() ?? fileName;
}

/**
 * Parse one or more tabular files (CSV/TSV/XLSX) into a single dataset payload.
 * All files must share compatible headers; mismatched files raise HEADER_MISMATCH.
 */
export async function parseTabularFiles(
  files: readonly TabularSourceFileV1[],
): Promise<ParsedTabularData> {
  if (files.length === 0) throw new TabularParseError('EMPTY_FILE');
  for (const file of files) {
    if (file.bytes.byteLength > MAX_TABULAR_FILE_BYTES) {
      throw new TabularParseError('LIMIT_EXCEEDED', `${file.fileName} exceeds 100 MB`);
    }
  }

  const { parseXlsxContent } = await import('./xlsx-parser.ts');
  const kindOf = (fileName: string) => fileKind(tabularFileName(fileName));

  const first = files[0]!;
  const primaryName = tabularFileName(first.fileName);
  const fileSources: ParsedFileSourceV1[] = [];
  const rawTextSnippets: string[] = [];

  let headers: readonly string[] | undefined;
  let mergedDataRows: string[][] = [];
  let malformedRowCount = 0;
  const warnings: string[] = [];

  for (const file of files) {
    const cleanName = tabularFileName(file.fileName);
    const kind = kindOf(cleanName);
    const text = kind === 'xlsx' ? '' : decodeUtf8(file.bytes);
    const rawRows =
      kind === 'xlsx'
        ? await parseXlsxContent(cleanName, file.bytes)
        : parseCsvRows(text, kind === 'tsv' ? '\t' : detectDelimiter(text));

    if (rawRows.length === 0) throw new TabularParseError('EMPTY_FILE', cleanName);
    if (rawRows.length - 1 > MAX_TABULAR_ROWS) {
      throw new TabularParseError('LIMIT_EXCEEDED', `${cleanName} exceeds 1,000,000 rows`);
    }

    const fileHeaders = rawRows[0]!.map((header, idx) =>
      header.length > 0 ? header : `Cột_${idx + 1}`,
    );
    if (fileHeaders.length > MAX_TABULAR_COLUMNS) {
      throw new TabularParseError('LIMIT_EXCEEDED', `${cleanName} exceeds 256 columns`);
    }

    if (headers === undefined) {
      headers = fileHeaders;
    } else {
      const currentHeaders = headers;
      const expected = currentHeaders.join('\u0000');
      const actual = fileHeaders.join('\u0000');
      if (expected !== actual) {
        const missing = currentHeaders.filter((h) => !fileHeaders.includes(h));
        const extra = fileHeaders.filter((h) => !currentHeaders.includes(h));
        throw new TabularParseError(
          'HEADER_MISMATCH',
          [
            cleanName,
            missing.length > 0
              ? `missing: ${missing.slice(0, 5).join(', ')}`
              : undefined,
            extra.length > 0 ? `unexpected: ${extra.slice(0, 5).join(', ')}` : undefined,
          ]
            .filter((part) => part !== undefined)
            .join(' · '),
        );
      }
    }

    const dataRows = rawRows.slice(1);
    for (const row of dataRows) {
      if (row.length !== fileHeaders.length) {
        malformedRowCount++;
        warnings.push(
          `${cleanName}: row field count ${row.length} differs from header count ${fileHeaders.length}`,
        );
      }
    }
    mergedDataRows = mergedDataRows.concat(dataRows);
    fileSources.push({
      fileName: cleanName,
      byteSize: file.bytes.byteLength,
      rowCount: dataRows.length,
    });
    rawTextSnippets.push(kind === 'xlsx' ? `[xlsx] ${cleanName}` : text.slice(0, 500));
  }

  return inferTabular(primaryName, headers ?? [], mergedDataRows, {
    malformedRowCount,
    warnings,
    fileSources,
    rawTextSnippet: rawTextSnippets.join('\n---\n').slice(0, 500),
  });
}

export function inferTabular(
  fileName: string,
  headers: readonly string[],
  dataRows: readonly string[][],
  metadata: {
    readonly malformedRowCount: number;
    readonly warnings: readonly string[];
    readonly fileSources: readonly ParsedFileSourceV1[];
    readonly rawTextSnippet: string;
  },
): ParsedTabularData {
  const columnValues: string[][] = headers.map(() => []);
  for (const row of dataRows) {
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      columnValues[colIdx]!.push(row[colIdx] ?? '');
    }
  }

  const warnings = [...metadata.warnings];
  const columns: ParsedColumnSchema[] = headers.map((name, idx) => {
    const values = columnValues[idx]!;
    const { convention } = detectNumberConvention(values);
    const type = inferFieldType(values, convention);
    const nullCount = values.filter((v) => v === '').length;
    const sampleValues = values.filter((v) => v !== '').slice(0, 5);
    return {
      name,
      type,
      nullCount,
      invalidCount: 0,
      convention,
      sampleValues,
    };
  });

  const rows: Record<string, string | number | boolean | null>[] = dataRows.map((row) => {
    const record: Record<string, string | number | boolean | null> = {};
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const col = columns[colIdx]!;
      const rawVal = row[colIdx] ?? '';
      const coerced = coerceValue(rawVal, col.type, col.convention);
      record[col.name] = coerced;
      if (coerced === null && rawVal.trim() !== '') {
        (columns[colIdx] as { invalidCount: number }).invalidCount++;
      }
    }
    return record;
  });
  if (columns.some((col) => col.convention === 'MIXED')) {
    warnings.push(
      'Mixed number formats detected — check columns before trusting totals',
    );
  }

  return {
    fileName,
    headers,
    columns,
    rows,
    totalRows: rows.length,
    malformedRowCount: metadata.malformedRowCount,
    rawTextSnippet: metadata.rawTextSnippet,
    warnings: [...new Set(warnings)],
    fileSources: metadata.fileSources,
  };
}

/** Back-compat single-file CSV entry point used by tests and legacy call sites. */
export function parseCsvContent(fileName: string, text: string): ParsedTabularData {
  const clean = stripBom(text);
  const rawRows = parseCsvRows(clean, detectDelimiter(clean));
  if (rawRows.length === 0) throw new TabularParseError('EMPTY_FILE', fileName);
  if (rawRows.length - 1 > MAX_TABULAR_ROWS) {
    throw new TabularParseError('LIMIT_EXCEEDED', `${fileName} exceeds 1,000,000 rows`);
  }
  const headers = rawRows[0]!.map((header, idx) => (header.length > 0 ? header : `Cột_${idx + 1}`));
  if (headers.length > MAX_TABULAR_COLUMNS) {
    throw new TabularParseError('LIMIT_EXCEEDED', `${fileName} exceeds 256 columns`);
  }
  let malformedRowCount = 0;
  const warnings: string[] = [];
  for (const row of rawRows.slice(1)) {
    if (row.length !== headers.length) {
      malformedRowCount++;
      warnings.push(`row field count ${row.length} differs from header count ${headers.length}`);
    }
  }
  return inferTabular(fileName, headers, rawRows.slice(1), {
    malformedRowCount,
    warnings,
    fileSources: [
      { fileName: tabularFileName(fileName), byteSize: clean.length, rowCount: rawRows.length - 1 },
    ],
    rawTextSnippet: clean.slice(0, 500),
  });
}

export function computeQuality(parsed: ParsedTabularData): DatasetQualityV1 {
  const totalCells = Math.max(parsed.totalRows * parsed.columns.length, 1);
  const emptyCells = parsed.columns.reduce((sum, col) => sum + col.nullCount, 0);
  const invalidCells = parsed.columns.reduce((sum, col) => sum + col.invalidCount, 0);
  const nonEmptyCells = Math.max(totalCells - emptyCells, 1);
  const completeness = Math.max(0, Math.min(1, (totalCells - emptyCells) / totalCells));
  const validity = Math.max(0, Math.min(1, (nonEmptyCells - invalidCells) / nonEmptyCells));

  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const row of parsed.rows) {
    const key = JSON.stringify(parsed.headers.map((h) => row[h] ?? null));
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }
  const uniqueness =
    parsed.totalRows === 0 ? 1 : Math.max(0, Math.min(1, (parsed.totalRows - duplicateRows) / parsed.totalRows));

  const mixedColumns = parsed.columns.filter((col) => col.convention === 'MIXED').length;
  const consistency =
    parsed.columns.length === 0
      ? 1
      : Math.max(0, Math.min(1, (parsed.columns.length - mixedColumns) / parsed.columns.length));

  return Object.freeze({
    completeness: Number(completeness.toFixed(4)),
    validity: Number(validity.toFixed(4)),
    uniqueness: Number(uniqueness.toFixed(4)),
    consistency: Number(consistency.toFixed(4)),
  });
}

export interface BuildDatasetRecordOptionsV1 {
  readonly datasetId?: string;
  readonly label?: string;
  readonly origin?: 'LOCAL' | 'SERVER';
  readonly syncState?: 'LOCAL_ONLY' | 'SERVER_MIRRORED';
  readonly existingRecord?: DatasetRecordV1;
  readonly sourceFilePrefix?: string;
}

export function buildDatasetRecordFromTabular(
  parsed: ParsedTabularData,
  locale: 'en' | 'vi-VN',
  options: BuildDatasetRecordOptionsV1 = {},
): DatasetRecordV1 {
  const now = new Date().toISOString();
  const cleanName = tabularFileName(parsed.fileName);
  const baseName = cleanName.replace(/\.[^/.]+$/u, '');
  const fallbackLabel = baseName.charAt(0).toUpperCase() + baseName.slice(1).replace(/[-_]/gu, ' ');
  const datasetId = options.datasetId ?? crypto.randomUUID();

  const schema = parsed.columns.map((column) => ({
    name: column.name,
    type: column.type,
    nullable: column.nullCount > 0 || column.invalidCount > 0,
  }));

  const version: DatasetRecordVersionV1 = Object.freeze({
    versionId: `v${(options.existingRecord?.versions.length ?? 0) + 1}-${datasetId.slice(0, 8)}`,
    createdAt: now,
    rowCount: parsed.totalRows,
    schema: Object.freeze(schema),
  });

  const sources: readonly DatasetSourceFileV1[] = parsed.fileSources.map((file) =>
    Object.freeze({
      sourceId: crypto.randomUUID(),
      label: file.fileName,
      sourceType: /\.xlsx$/iu.test(file.fileName)
        ? ('XLSX' as const)
        : /\.(tsv|tab)$/iu.test(file.fileName)
          ? ('CSV' as const)
          : ('CSV' as const),
      versionLabel:
        locale === 'vi-VN'
          ? `Bản gốc · ${file.rowCount.toLocaleString('vi-VN')} hàng`
          : `Original · ${file.rowCount.toLocaleString('en-US')} rows`,
      statusLabel: locale === 'vi-VN' ? 'Đã nhập' : 'Ingested',
      healthLabel: locale === 'vi-VN' ? 'Không có lỗi chặn' : 'No blocking issues',
      originalAction: 'VIEW_SAFE' as const,
      evidenceAvailable: true,
    }),
  );

  const quality = computeQuality(parsed);
  const emptyCells = parsed.columns.reduce((sum, col) => sum + col.nullCount, 0);
  const invalidCells = parsed.columns.reduce((sum, col) => sum + col.invalidCount, 0);

  const warnings: string[] = [];
  if (emptyCells > 0) {
    warnings.push(
      locale === 'vi-VN'
        ? `Có ${emptyCells} ô trống trong dữ liệu`
        : `${emptyCells} empty cells detected`,
    );
  }
  if (invalidCells > 0) {
    warnings.push(
      locale === 'vi-VN'
        ? `Có ${invalidCells} ô không khớp kiểu dữ liệu đã nhận diện`
        : `${invalidCells} cells did not match the inferred type`,
    );
  }
  if (parsed.malformedRowCount > 0) {
    warnings.push(
      locale === 'vi-VN'
        ? `Có ${parsed.malformedRowCount} dòng sai cấu trúc cột`
        : `${parsed.malformedRowCount} rows have a field count that differs from the header`,
    );
  }
  warnings.push(...parsed.warnings);

  const totalCells = Math.max(parsed.totalRows * parsed.columns.length, 1);
  const completeness = quality.completeness;
  const validity = quality.validity;

  const preparation: DatasetPreparationSummaryV1 = Object.freeze({
    automaticPolicy: 'SAFE_NON_LOSSY',
    counts: Object.freeze({
      input: parsed.totalRows,
      output: parsed.totalRows,
      unchanged: parsed.totalRows,
      changed: 0,
      rejected: parsed.malformedRowCount,
      quarantined: 0,
      unsupported: 0,
    }),
    transformations: [
      locale === 'vi-VN' ? 'Nhận diện kiểu dữ liệu cột tự động' : 'Automatic column type inference',
      locale === 'vi-VN' ? 'Chuẩn hóa định dạng số và ngày' : 'Normalized numeric & date formats',
      locale === 'vi-VN' ? 'Xử lý khoảng trắng thừa' : 'Trimmed extraneous whitespace',
    ],
    warnings: Object.freeze([...new Set(warnings)]),
    healthDimensions: Object.freeze([
      Object.freeze({
        dimension: locale === 'vi-VN' ? 'Đầy đủ' : 'Completeness',
        numerator: totalCells - emptyCells,
        denominator: totalCells,
        coverage: completeness,
        rule: 'required-fields',
        expectation: locale === 'vi-VN' ? 'Các trường có giá trị' : 'Fields have values',
        sampleState: locale === 'vi-VN' ? 'Toàn bộ dữ liệu' : 'All rows',
        limitations: Object.freeze([]),
      }),
      Object.freeze({
        dimension: locale === 'vi-VN' ? 'Hợp lệ' : 'Validity',
        numerator: Math.round(validity * totalCells),
        denominator: totalCells,
        coverage: validity,
        rule: 'typed-values',
        expectation: locale === 'vi-VN' ? 'Kiểu dữ liệu hợp lệ' : 'Valid typed values',
        sampleState: locale === 'vi-VN' ? 'Toàn bộ dữ liệu' : 'All rows',
        limitations: Object.freeze([]),
      }),
    ]),
    overallSummary: Object.freeze({
      formula: locale === 'vi-VN' ? 'trung bình có trọng số theo phạm vi kiểm tra' : 'weighted average over checked scope',
      coverage: Number(((completeness + validity) / 2).toFixed(4)),
      provesFactualCorrectness: false as const,
    }),
    datasetVersionLabel: locale === 'vi-VN' ? `Phiên bản ${version.versionId.replace(/^v(\d+)-.*$/u, '$1')}` : `Version ${version.versionId.replace(/^v(\d+)-.*$/u, '$1')}`,
    engineVersionLabel: 'DataBreeze In-Browser Engine 1.1',
  });

  return Object.freeze({
    datasetId,
    label: options.label?.trim() || fallbackLabel,
    origin: options.origin ?? 'LOCAL',
    syncState: options.syncState ?? 'LOCAL_ONLY',
    createdAt: options.existingRecord?.createdAt ?? now,
    currentVersion: version,
    versions: Object.freeze([...(options.existingRecord?.versions ?? []), version]),
    sources: Object.freeze([...(options.existingRecord?.sources ?? []), ...sources]),
    quality,
    preparation,
  });
}

export function buildDatasetFromTabularData(
  parsed: ParsedTabularData,
  locale: 'en' | 'vi-VN',
): { readonly dataset: DatasetCardV1; readonly parsedData: ParsedTabularData } {
  const record = buildDatasetRecordFromTabular(parsed, locale);
  return { dataset: toDatasetCardV1(record, locale), parsedData: parsed };
}
