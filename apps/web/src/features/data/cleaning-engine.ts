import type {
  CleaningIntentV1,
  CleaningRevisionV1,
  DatasetRecordV1,
  GovernedFieldTypeV1,
} from './data-model.ts';
import type { ParsedTabularData } from './csv-parser.ts';

/**
 * Deterministic cleaning engine (DDA-053 / DSM SAFE_NON_LOSSY policy).
 * Intents are typed commands — untrusted cell content never executes
 * anything (DDA-043). Planning computes impact without touching data;
 * applying returns a fresh tabular payload, never a mutation.
 */

export type CellValueV1 = string | number | boolean | null;

export interface PlannedIntentV1 {
  readonly intent: CleaningIntentV1;
  readonly valid: boolean;
  readonly invalidReason?: string;
  readonly lossy: boolean;
  readonly affectedCount: number;
  readonly descriptionVi: string;
  readonly descriptionEn: string;
  readonly exampleBefore?: string;
  readonly exampleAfter?: string;
}

export interface CleaningPlanV1 {
  readonly intents: readonly PlannedIntentV1[];
  readonly allValid: boolean;
  readonly anyLossy: boolean;
}

const NUMERIC_LOOK = /^[+-]?\d+([.,]\d+)?$/u;
const DATE_OR_DATETIME =
  /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})([ T]\d{1,2}:\d{2}(:\d{2})?)?$/u;

function typeLabelVi(type: GovernedFieldTypeV1): string {
  return {
    TEXT: 'văn bản',
    INTEGER: 'số nguyên',
    DECIMAL: 'số thập phân',
    BOOLEAN: 'đúng/sai',
    DATE: 'ngày',
  }[type];
}

function typeLabelEn(type: GovernedFieldTypeV1): string {
  return { TEXT: 'text', INTEGER: 'integer', DECIMAL: 'decimal', BOOLEAN: 'boolean', DATE: 'date' }[
    type
  ];
}

function coerceCell(
  value: CellValueV1,
  targetType: GovernedFieldTypeV1,
): { value: CellValueV1; ok: boolean } {
  if (value === null) return { value: null, ok: true };
  if (targetType === 'TEXT') return { value: String(value), ok: true };
  if (targetType === 'BOOLEAN') {
    const lower = String(value).trim().toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'đúng') return { value: true, ok: true };
    if (lower === 'false' || lower === '0' || lower === 'sai') return { value: false, ok: true };
    return { value: null, ok: false };
  }
  const raw = String(value)
    .trim()
    .replace(/[₫$\s]/gu, '');
  if (targetType === 'INTEGER') {
    const normalized =
      raw.includes(',') && !raw.includes('.')
        ? raw.replace(/,/gu, '')
        : raw.replace(/\./gu, '').replace(/,/gu, '');
    if (/^[+-]?\d+$/u.test(normalized)) return { value: Number.parseInt(normalized, 10), ok: true };
    return { value: null, ok: false };
  }
  if (targetType === 'DECIMAL') {
    const normalized =
      raw.includes(',') && !raw.includes('.')
        ? raw.replace(/\./gu, '').replace(/,/gu, '.')
        : raw.replace(/,/gu, '');
    if (NUMERIC_LOOK.test(normalized)) return { value: Number.parseFloat(normalized), ok: true };
    return { value: null, ok: false };
  }
  // DATE: normalize to ISO-ish display string; keep the original on failure.
  const text = String(value).trim();
  if (!DATE_OR_DATETIME.test(text)) return { value: null, ok: false };
  return { value: normalizeDateText(text), ok: true };
}

export function normalizeDateText(text: string): string {
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/u.exec(text);
  let year: string;
  let month: string;
  let day: string;
  let rest: string;
  if (match !== null) {
    year = match[1] ?? '';
    month = match[2] ?? '';
    day = match[3] ?? '';
    rest = match[4] ?? '';
  } else {
    const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(.*)$/u.exec(text);
    if (dmy === null) return text;
    day = dmy[1] ?? '';
    month = dmy[2] ?? '';
    year = dmy[3] ?? '';
    rest = dmy[4] ?? '';
  }
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const timeMatch = /^([ T])(\d{1,2}):(\d{2})(?::(\d{2}))?$/u.exec(rest);
  const time =
    timeMatch !== null
      ? ` ${timeMatch[2]!.padStart(2, '0')}:${timeMatch[3]}${
          timeMatch[4] !== undefined ? `:${timeMatch[4]}` : ''
        }`
      : rest.trim().length > 0
        ? ` ${rest.trim()}`
        : '';
  return `${iso}${time}`;
}

function columnValues(rows: readonly Record<string, CellValueV1>[], column: string): CellValueV1[] {
  return rows.map((row) => row[column] ?? null);
}

function countDuplicates(rows: readonly Record<string, CellValueV1>[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const key = JSON.stringify(
      Object.keys(row)
        .sort()
        .map((column) => row[column] ?? null),
    );
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }
  return duplicates;
}

export interface MergeSourceV1 {
  readonly label: string;
  readonly tabular: ParsedTabularData;
}

export interface CleaningContextV1 {
  /** Lookup for MERGE_ON_KEY sources; keeps the engine free of store imports. */
  readonly getMergeSource?: (datasetId: string) => MergeSourceV1 | undefined;
}

function describe(intent: CleaningIntentV1, locale: 'vi-VN' | 'en'): string {
  const vi = locale === 'vi-VN';
  switch (intent.kind) {
    case 'CHANGE_COLUMN_TYPE':
      return vi
        ? `Đổi kiểu cột "${intent.column}" sang ${typeLabelVi(intent.targetType)}`
        : `Change column "${intent.column}" to ${typeLabelEn(intent.targetType)}`;
    case 'RENAME_COLUMN':
      return vi
        ? `Đổi tên cột "${intent.column}" thành "${intent.newName}"`
        : `Rename column "${intent.column}" to "${intent.newName}"`;
    case 'DEDUPLICATE_ROWS':
      return vi ? 'Loại bỏ các dòng trùng lặp hoàn toàn' : 'Remove fully duplicated rows';
    case 'NORMALIZE_VALUES':
      return vi
        ? `Chuẩn hóa giá trị cột "${intent.column}"${intent.trim ? ' (cắt khoảng trắng)' : ''}${intent.lowercase ? ' (viết thường)' : ''}`
        : `Normalize values in "${intent.column}"${intent.trim ? ' (trim)' : ''}${intent.lowercase ? ' (lowercase)' : ''}`;
    case 'FILTER_ROWS':
      return vi
        ? `Lọc dòng theo cột "${intent.column}" ${intent.operator === 'EMPTY' ? 'trống' : intent.operator === 'NOT_EMPTY' ? 'không trống' : `${intent.operator} "${intent.value ?? ''}"`}`
        : `Filter rows on "${intent.column}" ${intent.operator}`;
    case 'FIX_DATE_FORMAT':
      return vi
        ? `Chuẩn hóa định dạng ngày của cột "${intent.column}"`
        : `Normalize date format in "${intent.column}"`;
    case 'MERGE_ON_KEY':
      return vi
        ? `Ghép cột từ bộ dữ liệu khác theo khóa "${intent.keyColumn}"`
        : `Merge columns from another dataset on key "${intent.keyColumn}"`;
  }
}

/** Dry-run: compute impact, samples, and lossy flags without modifying data. */
export function planIntents(
  parsed: ParsedTabularData,
  intents: readonly CleaningIntentV1[],
  context: CleaningContextV1 = {},
): CleaningPlanV1 {
  const planned: PlannedIntentV1[] = intents.map((intent) => {
    const base = {
      intent,
      descriptionVi: describe(intent, 'vi-VN'),
      descriptionEn: describe(intent, 'en'),
    };

    if (intent.kind === 'CHANGE_COLUMN_TYPE') {
      const column = parsed.columns.find((candidate) => candidate.name === intent.column);
      if (column === undefined) {
        return {
          ...base,
          valid: false,
          invalidReason: 'unknown column',
          lossy: false,
          affectedCount: 0,
        };
      }
      const values = columnValues(parsed.rows, intent.column);
      let failures = 0;
      let exampleBefore: string | undefined;
      let exampleAfter: string | undefined;
      for (const value of values) {
        const result = coerceCell(value, intent.targetType);
        if (!result.ok) {
          failures++;
          if (exampleBefore === undefined && value !== null) {
            exampleBefore = String(value);
            exampleAfter = 'null';
          }
        } else if (
          exampleBefore === undefined &&
          value !== null &&
          String(result.value) !== String(value)
        ) {
          exampleBefore = String(value);
          exampleAfter = String(result.value);
        }
      }
      return {
        ...base,
        valid: true,
        lossy: failures > 0,
        affectedCount: values.filter((value) => value !== null).length,
        ...(exampleBefore !== undefined && exampleAfter !== undefined
          ? { exampleBefore, exampleAfter }
          : {}),
      };
    }

    if (intent.kind === 'RENAME_COLUMN') {
      const exists = parsed.headers.includes(intent.column);
      const taken = parsed.headers.includes(intent.newName);
      if (!exists || taken || intent.newName.trim().length === 0) {
        return {
          ...base,
          valid: false,
          invalidReason: !exists ? 'unknown column' : 'invalid name',
          lossy: false,
          affectedCount: 0,
        };
      }
      return { ...base, valid: true, lossy: false, affectedCount: parsed.rows.length };
    }

    if (intent.kind === 'DEDUPLICATE_ROWS') {
      const duplicates = countDuplicates(parsed.rows);
      return { ...base, valid: true, lossy: duplicates > 0, affectedCount: duplicates };
    }

    if (intent.kind === 'NORMALIZE_VALUES') {
      const column = parsed.columns.find((candidate) => candidate.name === intent.column);
      if (column === undefined) {
        return {
          ...base,
          valid: false,
          invalidReason: 'unknown column',
          lossy: false,
          affectedCount: 0,
        };
      }
      let affected = 0;
      for (const row of parsed.rows) {
        const value = row[intent.column];
        if (typeof value !== 'string') continue;
        const normalized = (intent.trim ? value.trim() : value)[
          intent.lowercase ? 'toLowerCase' : 'toString'
        ]();
        if (normalized !== value) affected++;
      }
      return {
        ...base,
        valid: true,
        lossy: intent.lowercase && affected > 0,
        affectedCount: affected,
      };
    }

    if (intent.kind === 'FILTER_ROWS') {
      const column = parsed.columns.find((candidate) => candidate.name === intent.column);
      if (column === undefined) {
        return {
          ...base,
          valid: false,
          invalidReason: 'unknown column',
          lossy: false,
          affectedCount: 0,
        };
      }
      const matched = parsed.rows.filter((row) => {
        const value = row[intent.column];
        if (intent.operator === 'EMPTY') return value === null || value === '';
        if (intent.operator === 'NOT_EMPTY') return !(value === null || value === '');
        const text = value === null ? '' : String(value);
        return intent.operator === 'EQ' ? text === intent.value : text !== intent.value;
      }).length;
      return { ...base, valid: true, lossy: matched > 0, affectedCount: matched };
    }

    if (intent.kind === 'FIX_DATE_FORMAT') {
      const column = parsed.columns.find((candidate) => candidate.name === intent.column);
      if (column === undefined) {
        return {
          ...base,
          valid: false,
          invalidReason: 'unknown column',
          lossy: false,
          affectedCount: 0,
        };
      }
      let affected = 0;
      let exampleBefore: string | undefined;
      let exampleAfter: string | undefined;
      for (const row of parsed.rows) {
        const value = row[intent.column];
        if (typeof value !== 'string' || value.trim() === '') continue;
        const normalized = normalizeDateText(value.trim());
        if (normalized !== value) {
          affected++;
          if (exampleBefore === undefined) {
            exampleBefore = value;
            exampleAfter = normalized;
          }
        }
      }
      return {
        ...base,
        valid: true,
        lossy: false,
        affectedCount: affected,
        ...(exampleBefore !== undefined && exampleAfter !== undefined
          ? { exampleBefore, exampleAfter }
          : {}),
      };
    }

    // MERGE_ON_KEY
    const source = context.getMergeSource?.(intent.sourceDatasetId);
    if (source === undefined) {
      return {
        ...base,
        valid: false,
        invalidReason: 'source dataset unavailable',
        lossy: false,
        affectedCount: 0,
      };
    }
    if (
      !source.tabular.headers.includes(intent.keyColumn) ||
      !parsed.headers.includes(intent.keyColumn)
    ) {
      return {
        ...base,
        valid: false,
        invalidReason: 'key column missing',
        lossy: false,
        affectedCount: 0,
      };
    }
    const incoming = source.tabular.headers.filter((header) => !parsed.headers.includes(header));
    return {
      ...base,
      valid: incoming.length > 0,
      ...(incoming.length === 0 ? { invalidReason: 'no new columns' } : {}),
      lossy: false,
      affectedCount: incoming.length,
    };
  });

  return Object.freeze({
    intents: Object.freeze(planned),
    allValid: planned.every((item) => item.valid),
    anyLossy: planned.some((item) => item.lossy),
  });
}

function rebuildColumns(
  parsed: ParsedTabularData,
  headers: readonly string[],
  rows: readonly Record<string, CellValueV1>[],
  typeOverrides: ReadonlyMap<string, GovernedFieldTypeV1>,
): ParsedTabularData['columns'] {
  return headers.map((name) => {
    const previous = parsed.columns.find((column) => column.name === name);
    const values = columnValues(rows, name);
    let invalidCount = 0;
    for (const value of values) {
      if (value === null) invalidCount++;
    }
    return {
      name,
      type: typeOverrides.get(name) ?? previous?.type ?? 'TEXT',
      nullCount: invalidCount,
      invalidCount: 0,
      convention: previous?.convention ?? 'NONE',
      sampleValues: values
        .filter((value) => value !== null)
        .slice(0, 5)
        .map((value) => String(value)),
    };
  });
}

function rebuild(
  parsed: ParsedTabularData,
  headers: readonly string[],
  rows: readonly Record<string, CellValueV1>[],
  typeOverrides: ReadonlyMap<string, GovernedFieldTypeV1>,
  note: string,
): ParsedTabularData {
  return {
    fileName: parsed.fileName,
    headers: [...headers],
    columns: rebuildColumns(parsed, headers, rows, typeOverrides),
    rows: rows.map((row) => ({ ...row })),
    totalRows: rows.length,
    malformedRowCount: parsed.malformedRowCount,
    rawTextSnippet: parsed.rawTextSnippet,
    warnings: [...new Set([...parsed.warnings, note])],
    fileSources: parsed.fileSources,
  };
}

/** Apply validated intents sequentially; returns a fresh payload. */
export function applyIntents(
  parsed: ParsedTabularData,
  intents: readonly CleaningIntentV1[],
  context: CleaningContextV1 = {},
): ParsedTabularData {
  let headers = [...parsed.headers];
  let rows: Record<string, CellValueV1>[] = parsed.rows.map((row) => ({ ...row }));
  const typeOverrides = new Map<string, GovernedFieldTypeV1>();

  for (const intent of intents) {
    if (intent.kind === 'CHANGE_COLUMN_TYPE') {
      typeOverrides.set(intent.column, intent.targetType);
      rows = rows.map((row) => {
        const result = coerceCell(row[intent.column] ?? null, intent.targetType);
        return { ...row, [intent.column]: result.value };
      });
    } else if (intent.kind === 'RENAME_COLUMN') {
      headers = headers.map((header) => (header === intent.column ? intent.newName : header));
      const previousType = parsed.columns.find((column) => column.name === intent.column)?.type;
      if (previousType !== undefined) typeOverrides.set(intent.newName, previousType);
      rows = rows.map((row) => {
        const { [intent.column]: value, ...rest } = row;
        return { ...rest, [intent.newName]: value ?? null };
      });
    } else if (intent.kind === 'DEDUPLICATE_ROWS') {
      const seen = new Set<string>();
      rows = rows.filter((row) => {
        const key = JSON.stringify(headers.map((header) => row[header] ?? null));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else if (intent.kind === 'NORMALIZE_VALUES') {
      rows = rows.map((row) => {
        const value = row[intent.column];
        if (typeof value !== 'string') return row;
        let normalized = intent.trim ? value.trim() : value;
        if (intent.lowercase) normalized = normalized.toLowerCase();
        return { ...row, [intent.column]: normalized };
      });
    } else if (intent.kind === 'FILTER_ROWS') {
      rows = rows.filter((row) => {
        const value = row[intent.column];
        if (intent.operator === 'EMPTY') return !(value === null || value === '');
        if (intent.operator === 'NOT_EMPTY') return value === null || value === '';
        const text = value === null ? '' : String(value);
        return intent.operator === 'EQ' ? text !== intent.value : text === intent.value;
      });
    } else if (intent.kind === 'FIX_DATE_FORMAT') {
      rows = rows.map((row) => {
        const value = row[intent.column];
        if (typeof value !== 'string' || value.trim() === '') return row;
        return { ...row, [intent.column]: normalizeDateText(value.trim()) };
      });
    } else if (intent.kind === 'MERGE_ON_KEY') {
      const source = context.getMergeSource?.(intent.sourceDatasetId);
      if (source === undefined) continue;
      const incoming = source.tabular.headers.filter(
        (header) => !headers.includes(header) && header !== intent.keyColumn,
      );
      const sourceByKey = new Map<string, Record<string, CellValueV1>>();
      for (const row of source.tabular.rows) {
        const key = row[intent.keyColumn];
        if (key === null || key === undefined) continue;
        sourceByKey.set(String(key), row);
      }
      headers = [...headers, ...incoming];
      rows = rows.map((row) => {
        const key = row[intent.keyColumn];
        const match = key === null || key === undefined ? undefined : sourceByKey.get(String(key));
        const merged: Record<string, CellValueV1> = { ...row };
        for (const column of incoming) merged[column] = match?.[column] ?? null;
        return merged;
      });
    }
  }

  return rebuild(
    parsed,
    headers,
    rows,
    typeOverrides,
    `cleaned: ${intents.length} intent(s) applied`,
  );
}

export function buildCleaningRevision(
  intents: readonly CleaningIntentV1[],
  lossy: boolean,
  rowCountBefore: number,
  rowCountAfter: number,
): CleaningRevisionV1 {
  return Object.freeze({
    revisionId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    intents: Object.freeze([...intents]),
    summaryVi: describe(intents[0] ?? { kind: 'DEDUPLICATE_ROWS' }, 'vi-VN'),
    summaryEn: describe(intents[0] ?? { kind: 'DEDUPLICATE_ROWS' }, 'en'),
    lossy,
    rowCountBefore,
    rowCountAfter,
  });
}

/** Auto-detected fix queue: SAFE_NON_LOSSY first, confirm-required last. */
export function deriveSafeIntents(parsed: ParsedTabularData): CleaningIntentV1[] {
  const intents: CleaningIntentV1[] = [];

  for (const column of parsed.columns) {
    if (column.type !== 'TEXT') continue;
    const values = columnValues(parsed.rows, column.name).filter(
      (value) => value !== null && value !== '',
    ) as string[];
    if (values.length === 0) continue;

    const numeric = values.filter((value) => NUMERIC_LOOK.test(String(value).trim()));
    const dates = values.filter((value) => DATE_OR_DATETIME.test(String(value).trim()));
    const threshold = values.length * 0.85;

    if (numeric.length >= threshold) {
      const allIntegers = numeric.every((value) =>
        /^[+-]?\d+$/u.test(String(value).replace(/[.,\s₫$]/gu, '')),
      );
      intents.push({
        kind: 'CHANGE_COLUMN_TYPE',
        column: column.name,
        targetType: allIntegers ? 'INTEGER' : 'DECIMAL',
      });
    } else if (dates.length >= threshold) {
      intents.push({ kind: 'FIX_DATE_FORMAT', column: column.name });
    }
  }

  if (countDuplicates(parsed.rows) > 0) {
    intents.push({ kind: 'DEDUPLICATE_ROWS' });
  }

  return intents;
}

export interface CoherenceFindingV1 {
  readonly severity: 'info' | 'warning';
  readonly textVi: string;
  readonly textEn: string;
}

export interface CoherenceReportV1 {
  readonly findings: readonly CoherenceFindingV1[];
}

/** Cross-dataset project coherence: shared columns and duplicate keys. */
export function coherenceCheck(
  members: readonly { readonly record: DatasetRecordV1; readonly tabular: ParsedTabularData }[],
): CoherenceReportV1 {
  const findings: CoherenceFindingV1[] = [];
  if (members.length < 2) {
    return {
      findings: [
        {
          severity: 'info',
          textVi: 'Thêm dữ liệu vào dự án để kiểm tra tính nhất quán.',
          textEn: 'Add datasets to the project to check coherence.',
        },
      ],
    };
  }

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]!;
      const b = members[j]!;
      const shared = a.tabular.headers.filter((header) => b.tabular.headers.includes(header));
      if (shared.length > 0) {
        const keyColumn = shared.find(
          (header) =>
            /(^|_)(id|mã|ma|code|key)($|_)/iu.test(header) || /id|mã|code|key/iu.test(header),
        );
        if (keyColumn !== undefined) {
          const keysA = new Set(
            a.tabular.rows.map((row) => String(row[keyColumn] ?? '')).filter((key) => key !== ''),
          );
          const overlap = b.tabular.rows.filter((row) =>
            keysA.has(String(row[keyColumn] ?? '')),
          ).length;
          if (overlap > 0) {
            findings.push({
              severity: 'warning',
              textVi: `"${a.record.label}" và "${b.record.label}" có ${overlap} giá trị trùng trên cột khóa "${keyColumn}" — hãy kiểm tra xem đây là dữ liệu trùng hay cần ghép.`,
              textEn: `"${a.record.label}" and "${b.record.label}" share ${overlap} values on key column "${keyColumn}" — check for duplicates or merge.`,
            });
          } else {
            findings.push({
              severity: 'info',
              textVi: `"${a.record.label}" và "${b.record.label}" cùng có cột "${keyColumn}" nhưng không trùng giá trị — có thể ghép được.`,
              textEn: `"${a.record.label}" and "${b.record.label}" share column "${keyColumn}" with no overlapping values — merge candidates.`,
            });
          }
        } else {
          findings.push({
            severity: 'info',
            textVi: `"${a.record.label}" và "${b.record.label}" có ${shared.length} cột chung: ${shared.slice(0, 4).join(', ')}.`,
            textEn: `"${a.record.label}" and "${b.record.label}" share ${shared.length} columns: ${shared.slice(0, 4).join(', ')}.`,
          });
        }
      }
    }
  }

  if (findings.length === 0) {
    findings.push({
      severity: 'info',
      textVi:
        'Các bộ dữ liệu trong dự án không có cột chung — hãy đặt tên cột nhất quán để có thể ghép.',
      textEn: 'Datasets in this project share no columns — align column names to enable merging.',
    });
  }
  return { findings: Object.freeze(findings) };
}
