import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** SA-001..SA-006: value-free, exact-version spreadsheet audit results. */
export const SPREADSHEET_AUDIT_SCHEMA_VERSION_V1 = 1 as const;

export type SpreadsheetAuditFindingKindV1 = 'FORMULA_FAMILY_OUTLIER' | 'FORMULA_GAP';
export type SpreadsheetAuditSeverityV1 = 'INFO' | 'WARNING' | 'ERROR';
export type SpreadsheetAuditBlockedReasonV1 = 'MACRO' | 'EXTERNAL_LINK' | 'UNSUPPORTED_XML';

export interface SpreadsheetAuditSheetV1 {
  readonly sheetId: StableIdentifierV1;
  readonly name: string;
  readonly maxRow: number;
  readonly maxColumn: number;
  readonly formulaCount: number;
}

export interface SpreadsheetAuditFindingV1 {
  readonly findingId: StableIdentifierV1;
  readonly sheetId: StableIdentifierV1;
  readonly address: string;
  readonly kind: SpreadsheetAuditFindingKindV1;
  readonly severity: SpreadsheetAuditSeverityV1;
  readonly formulaFingerprint: string;
}

export interface SpreadsheetAuditResultV1 {
  readonly schemaVersion: typeof SPREADSHEET_AUDIT_SCHEMA_VERSION_V1;
  readonly auditId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly workbookSha256: string;
  readonly sheets: readonly SpreadsheetAuditSheetV1[];
  readonly findings: readonly SpreadsheetAuditFindingV1[];
  readonly blockedReasons: readonly SpreadsheetAuditBlockedReasonV1[];
  readonly processorVersion: string;
  readonly createdAt: StrictUtcTimestampV1;
}

export type SpreadsheetAuditErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TEXT'
  | 'INVALID_HASH'
  | 'INVALID_COORDINATE'
  | 'INVALID_COUNT'
  | 'INVALID_SEVERITY'
  | 'INVALID_KIND'
  | 'INVALID_BLOCKED_REASON'
  | 'DUPLICATE_IDENTIFIER'
  | 'DUPLICATE_SHEET'
  | 'INVALID_TIMESTAMP';

export type SpreadsheetAuditResultValidationV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: SpreadsheetAuditErrorCodeV1 };

function rejected(code: SpreadsheetAuditErrorCodeV1): SpreadsheetAuditResultValidationV1<never> {
  return Object.freeze({ accepted: false, code });
}

function identifier(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input)
    ? input.toLowerCase()
    : undefined;
}

function isBlockedReason(input: unknown): input is SpreadsheetAuditBlockedReasonV1 {
  return input === 'MACRO' || input === 'EXTERNAL_LINK' || input === 'UNSUPPORTED_XML';
}

function count(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? input : undefined;
}

function columnNumber(value: string): number {
  let result = 0;
  for (const character of value) result = result * 26 + character.charCodeAt(0) - 64;
  return result;
}

function sheet(input: unknown): SpreadsheetAuditSheetV1 | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const sheetId = identifier(record['sheetId']);
  const name = text(record['name'], 128);
  const maxRow = count(record['maxRow']);
  const maxColumn = count(record['maxColumn']);
  const formulaCount = count(record['formulaCount']);
  if (
    !sheetId ||
    !name ||
    maxRow === undefined ||
    maxColumn === undefined ||
    formulaCount === undefined
  )
    return undefined;
  if (maxRow > 1_000_000 || maxColumn > 16_384 || formulaCount > 1_000_000) return undefined;
  return Object.freeze({ sheetId, name, maxRow, maxColumn, formulaCount });
}

function finding(input: unknown): SpreadsheetAuditFindingV1 | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const findingId = identifier(record['findingId']);
  const sheetId = identifier(record['sheetId']);
  const address = text(record['address'], 16);
  const kind = record['kind'];
  const severity = record['severity'];
  const formulaFingerprint = hash(record['formulaFingerprint']);
  if (!findingId || !sheetId || !address || !/^[A-Z]{1,3}[1-9][0-9]*$/u.test(address.toUpperCase()))
    return undefined;
  if (kind !== 'FORMULA_FAMILY_OUTLIER' && kind !== 'FORMULA_GAP') return undefined;
  if (severity !== 'INFO' && severity !== 'WARNING' && severity !== 'ERROR') return undefined;
  if (!formulaFingerprint) return undefined;
  return Object.freeze({
    findingId,
    sheetId,
    address: address.toUpperCase(),
    kind: kind as SpreadsheetAuditFindingKindV1,
    severity: severity as SpreadsheetAuditSeverityV1,
    formulaFingerprint,
  });
}

export function createSpreadsheetAuditResultV1(input: {
  readonly auditId: unknown;
  readonly artifactVersionId: unknown;
  readonly tenantScope: unknown;
  readonly workbookSha256: unknown;
  readonly sheets: unknown;
  readonly findings: unknown;
  readonly blockedReasons: unknown;
  readonly processorVersion: unknown;
  readonly createdAt: unknown;
}): SpreadsheetAuditResultValidationV1<SpreadsheetAuditResultV1> {
  const auditId = identifier(input.auditId);
  const artifactVersionId = identifier(input.artifactVersionId);
  const tenantScope = parseTenantScopeV1(input.tenantScope);
  const workbookSha256 = hash(input.workbookSha256);
  const processorVersion = text(input.processorVersion, 128);
  const createdAt = timestamp(input.createdAt);
  if (!auditId || !artifactVersionId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope.accepted) return rejected('INVALID_SCOPE');
  if (!workbookSha256) return rejected('INVALID_HASH');
  if (!processorVersion) return rejected('INVALID_TEXT');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (!Array.isArray(input.sheets) || input.sheets.length === 0 || input.sheets.length > 512)
    return rejected('INVALID_COUNT');
  const sheets = input.sheets.map(sheet);
  if (sheets.some((candidate): candidate is undefined => candidate === undefined))
    return rejected('INVALID_COUNT');
  const validSheets = sheets as SpreadsheetAuditSheetV1[];
  if (new Set(validSheets.map((candidate) => candidate.sheetId)).size !== validSheets.length)
    return rejected('DUPLICATE_IDENTIFIER');
  if (new Set(validSheets.map((candidate) => candidate.name)).size !== validSheets.length)
    return rejected('DUPLICATE_SHEET');
  if (!Array.isArray(input.findings) || input.findings.length > 10_000)
    return rejected('INVALID_COUNT');
  const findings = input.findings.map(finding);
  if (findings.some((candidate): candidate is undefined => candidate === undefined))
    return rejected('INVALID_COUNT');
  const validFindings = findings as SpreadsheetAuditFindingV1[];
  if (new Set(validFindings.map((candidate) => candidate.findingId)).size !== validFindings.length)
    return rejected('DUPLICATE_IDENTIFIER');
  const sheetsById = new Map(validSheets.map((candidate) => [candidate.sheetId, candidate]));
  for (const candidate of validFindings) {
    const targetSheet = sheetsById.get(candidate.sheetId);
    if (!targetSheet) return rejected('INVALID_IDENTIFIER');
    const address = /^([A-Z]{1,3})([1-9][0-9]*)$/u.exec(candidate.address);
    if (!address) return rejected('INVALID_COORDINATE');
    const column = columnNumber(address[1] ?? '');
    const row = Number(address[2]);
    if (column > targetSheet.maxColumn || row > targetSheet.maxRow)
      return rejected('INVALID_COORDINATE');
  }
  if (!Array.isArray(input.blockedReasons) || input.blockedReasons.length > 3)
    return rejected('INVALID_BLOCKED_REASON');
  const validBlockedReasons: SpreadsheetAuditBlockedReasonV1[] = [];
  for (const candidate of input.blockedReasons) {
    if (!isBlockedReason(candidate)) return rejected('INVALID_BLOCKED_REASON');
    validBlockedReasons.push(candidate);
  }
  if (new Set(validBlockedReasons).size !== validBlockedReasons.length)
    return rejected('INVALID_BLOCKED_REASON');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: SPREADSHEET_AUDIT_SCHEMA_VERSION_V1,
      auditId,
      artifactVersionId,
      tenantScope: tenantScope.value,
      workbookSha256,
      sheets: Object.freeze(validSheets),
      findings: Object.freeze(validFindings),
      blockedReasons: Object.freeze(validBlockedReasons),
      processorVersion,
      createdAt,
    }),
  });
}
