import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';
import type { QualityStateV1 } from '../dataset-governance/v1.js';

/** DSM-011, DSM-013, DSM-015, DSM-020: immutable, value-free quality evidence. */
export const DATASET_QUALITY_SCHEMA_VERSION_V1 = 1 as const;

export type DatasetQualityFindingSeverityV1 = 'INFO' | 'WARNING' | 'ERROR';

export type DatasetQualitySafeValueKindV1 =
  | 'TEXT'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'DATE'
  | 'MISSING'
  | 'NULL'
  | 'BLANK'
  | 'INVALID'
  | 'ZERO'
  | 'NOT_APPLICABLE'
  | 'REDACTED';

export interface DatasetQualitySafeValueV1 {
  readonly kind: DatasetQualitySafeValueKindV1;
  readonly value?: string | number | boolean;
}

export type DatasetQualitySubjectTypeV1 = 'DATASET' | 'ROW' | 'FIELD' | 'CELL';

export interface DatasetQualityFindingSubjectV1 {
  readonly type: DatasetQualitySubjectTypeV1;
  readonly keyHash: string;
  readonly fieldId?: StableIdentifierV1;
}

export interface DatasetQualityFindingV1 {
  readonly findingId: StableIdentifierV1;
  readonly ruleId: StableIdentifierV1;
  readonly severity: DatasetQualityFindingSeverityV1;
  readonly messageCode: string;
  readonly occurrenceCount: number;
  readonly evidenceIds: readonly StableIdentifierV1[];
  readonly detailHash: string;
  readonly subject?: DatasetQualityFindingSubjectV1;
  readonly actual?: DatasetQualitySafeValueV1;
  readonly expected?: DatasetQualitySafeValueV1;
}

export interface DatasetQualityResultV1 {
  readonly schemaVersion: typeof DATASET_QUALITY_SCHEMA_VERSION_V1;
  readonly resultId: StableIdentifierV1;
  readonly datasetId: StableIdentifierV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly ruleSetVersionId: StableIdentifierV1;
  readonly profileFingerprint: string;
  readonly rowCountScanned: number;
  readonly qualityState: QualityStateV1;
  readonly findings: readonly DatasetQualityFindingV1[];
  readonly resultFingerprint: string;
  readonly createdAt: StrictUtcTimestampV1;
}

export type DatasetQualityErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_HASH'
  | 'INVALID_COUNT'
  | 'INVALID_TEXT'
  | 'INVALID_FINDING'
  | 'DUPLICATE_FINDING'
  | 'INVALID_QUALITY_STATE'
  | 'INVALID_TYPED_VALUE';

export type DatasetQualityResultV1Of<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DatasetQualityErrorCodeV1 };

function accepted<TValue>(value: TValue): DatasetQualityResultV1Of<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: DatasetQualityErrorCodeV1): DatasetQualityResultV1Of<never> {
  return Object.freeze({ accepted: false, code });
}

function identifier(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function scope(input: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input)
    ? input.toLowerCase()
    : undefined;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function positiveCount(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? input : undefined;
}

const safeValueKinds: readonly DatasetQualitySafeValueKindV1[] = [
  'TEXT',
  'INTEGER',
  'DECIMAL',
  'BOOLEAN',
  'DATE',
  'MISSING',
  'NULL',
  'BLANK',
  'INVALID',
  'ZERO',
  'NOT_APPLICABLE',
  'REDACTED',
];

function safeValue(input: unknown): DatasetQualitySafeValueV1 | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const kind = record['kind'];
  if (!safeValueKinds.includes(kind as DatasetQualitySafeValueKindV1)) return undefined;
  const value = record['value'];
  if (value === undefined) {
    if (['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE'].includes(kind as string))
      return undefined;
    return Object.freeze({ kind: kind as DatasetQualitySafeValueKindV1 });
  }
  if (typeof value === 'string') {
    if (value.length === 0 || value.length > 256 || /\p{Cc}/u.test(value)) return undefined;
    return Object.freeze({
      kind: kind as DatasetQualitySafeValueKindV1,
      value: value.normalize('NFC'),
    });
  }
  if (typeof value === 'boolean') {
    if (kind !== 'BOOLEAN') return undefined;
    return Object.freeze({ kind: 'BOOLEAN', value });
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (!Number.isSafeInteger(value) && kind === 'INTEGER'))
      return undefined;
    if (!['INTEGER', 'DECIMAL'].includes(kind as string)) return undefined;
    return Object.freeze({ kind: kind as DatasetQualitySafeValueKindV1, value });
  }
  return undefined;
}

function subject(input: unknown): DatasetQualityFindingSubjectV1 | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const type = record['type'];
  const keyHash = hash(record['keyHash']);
  const fieldId = record['fieldId'] === undefined ? undefined : identifier(record['fieldId']);
  if (!['DATASET', 'ROW', 'FIELD', 'CELL'].includes(type as string) || !keyHash) return undefined;
  if (record['fieldId'] !== undefined && !fieldId) return undefined;
  if (['FIELD', 'CELL'].includes(type as string) && !fieldId) return undefined;
  return Object.freeze({
    type: type as DatasetQualitySubjectTypeV1,
    keyHash,
    ...(fieldId === undefined ? {} : { fieldId }),
  });
}

function finding(input: unknown): DatasetQualityFindingV1 | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const findingId = identifier(record['findingId']);
  const ruleId = identifier(record['ruleId']);
  const severity = record['severity'];
  const messageCode = text(record['messageCode'], 96);
  const occurrenceCount = positiveCount(record['occurrenceCount']);
  const detailHash = hash(record['detailHash']);
  const evidenceInput = record['evidenceIds'] ?? [];
  const parsedSubject = record['subject'] === undefined ? undefined : subject(record['subject']);
  const actual = record['actual'] === undefined ? undefined : safeValue(record['actual']);
  const expected = record['expected'] === undefined ? undefined : safeValue(record['expected']);
  if (!findingId || !ruleId || !messageCode || occurrenceCount === undefined || !detailHash) {
    return undefined;
  }
  if (!['INFO', 'WARNING', 'ERROR'].includes(severity as string)) return undefined;
  if (!Array.isArray(evidenceInput) || evidenceInput.length > 128) return undefined;
  const evidenceIds = evidenceInput.map(identifier);
  if (evidenceIds.some((candidate): candidate is undefined => candidate === undefined)) {
    return undefined;
  }
  if (record['subject'] !== undefined && !parsedSubject) return undefined;
  if (record['actual'] !== undefined && !actual) return undefined;
  if (record['expected'] !== undefined && !expected) return undefined;
  return Object.freeze({
    findingId,
    ruleId,
    severity: severity as DatasetQualityFindingSeverityV1,
    messageCode,
    occurrenceCount,
    evidenceIds: Object.freeze(evidenceIds as StableIdentifierV1[]),
    detailHash,
    ...(parsedSubject === undefined ? {} : { subject: parsedSubject }),
    ...(actual === undefined ? {} : { actual }),
    ...(expected === undefined ? {} : { expected }),
  });
}

export function qualityStateFromFindingsV1(
  findings: readonly DatasetQualityFindingV1[],
  incomplete = false,
): QualityStateV1 {
  if (incomplete) return 'INCOMPLETE';
  if (findings.some((candidate) => candidate.severity === 'ERROR')) return 'BLOCKED';
  if (findings.some((candidate) => candidate.severity === 'WARNING')) return 'PASS_WITH_WARNINGS';
  return 'PASS';
}

export function createDatasetQualityResultV1(input: {
  readonly resultId: unknown;
  readonly datasetId: unknown;
  readonly datasetVersionId: unknown;
  readonly tenantScope: unknown;
  readonly ruleSetVersionId: unknown;
  readonly profileFingerprint: unknown;
  readonly rowCountScanned: unknown;
  readonly qualityState: unknown;
  readonly findings: unknown;
  readonly resultFingerprint: unknown;
  readonly createdAt: unknown;
}): DatasetQualityResultV1Of<DatasetQualityResultV1> {
  const resultId = identifier(input.resultId);
  const datasetId = identifier(input.datasetId);
  const datasetVersionId = identifier(input.datasetVersionId);
  const tenantScope = scope(input.tenantScope);
  const ruleSetVersionId = identifier(input.ruleSetVersionId);
  const profileFingerprint = hash(input.profileFingerprint);
  const rowCountScanned = positiveCount(input.rowCountScanned);
  const resultFingerprint = hash(input.resultFingerprint);
  const createdAt = timestamp(input.createdAt);
  if (!resultId || !datasetId || !datasetVersionId || !ruleSetVersionId)
    return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!profileFingerprint || !resultFingerprint) return rejected('INVALID_HASH');
  if (rowCountScanned === undefined) return rejected('INVALID_COUNT');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (
    !['PASS', 'PASS_WITH_WARNINGS', 'BLOCKED', 'INCOMPLETE'].includes(input.qualityState as string)
  )
    return rejected('INVALID_QUALITY_STATE');
  if (!Array.isArray(input.findings) || input.findings.length > 512)
    return rejected('INVALID_FINDING');
  const findings = input.findings.map(finding);
  if (findings.some((candidate): candidate is undefined => candidate === undefined))
    return rejected('INVALID_FINDING');
  const typedFindings = findings as DatasetQualityFindingV1[];
  if (new Set(typedFindings.map((candidate) => candidate.findingId)).size !== typedFindings.length)
    return rejected('DUPLICATE_FINDING');
  return accepted(
    Object.freeze({
      schemaVersion: DATASET_QUALITY_SCHEMA_VERSION_V1,
      resultId,
      datasetId,
      datasetVersionId,
      tenantScope,
      ruleSetVersionId,
      profileFingerprint,
      rowCountScanned,
      qualityState: input.qualityState as QualityStateV1,
      findings: Object.freeze(typedFindings),
      resultFingerprint,
      createdAt,
    }),
  );
}
