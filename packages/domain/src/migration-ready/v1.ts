import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** MR-001..MR-017: profile and dry-run migration readiness without source mutation. */
export const MIGRATION_READY_SCHEMA_VERSION_V1 = 1 as const;
export interface MigrationDryRunRecordV1 {
  readonly rowNumber: number;
  readonly disposition: 'READY' | 'REJECTED' | 'DUPLICATE';
  readonly reasonCodes: readonly string[];
  readonly mappedFields: Readonly<Record<string, unknown>>;
}
export interface MigrationDryRunResultV1 {
  readonly schemaVersion: typeof MIGRATION_READY_SCHEMA_VERSION_V1;
  readonly projectId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly sourceVersionId: StableIdentifierV1;
  readonly targetSchemaVersionId: StableIdentifierV1;
  readonly status: 'READY' | 'BLOCKED';
  readonly records: readonly MigrationDryRunRecordV1[];
  readonly sourceMutated: false;
  readonly resultHash: string;
}
function id(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}
function scope(input: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed.value : undefined;
}
function text(input: unknown, max: number): string | undefined {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > max ||
    /\p{Cc}/u.test(input)
  )
    return undefined;
  const value = input.normalize('NFC').trim();
  return value.length > 0 ? value : undefined;
}
function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input)
    ? input.toLowerCase()
    : undefined;
}
function fingerprint(value: unknown): string {
  const input = JSON.stringify(value);
  let hashValue = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hashValue ^= input.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return (hashValue >>> 0).toString(16).padStart(8, '0').repeat(8);
}
export function evaluateMigrationDryRunV1(input: {
  readonly projectId: unknown;
  readonly tenantScope: unknown;
  readonly sourceVersionId: unknown;
  readonly sourceSha256: unknown;
  readonly targetSchemaVersionId: unknown;
  readonly targetFields: unknown;
  readonly keyField: unknown;
  readonly sourceRows: unknown;
}): MigrationDryRunResultV1 {
  const projectId = id(input.projectId);
  const tenantScope = scope(input.tenantScope);
  const sourceVersionId = id(input.sourceVersionId);
  const targetSchemaVersionId = id(input.targetSchemaVersionId);
  const keyField = text(input.keyField, 96);
  if (
    !projectId ||
    !tenantScope ||
    !sourceVersionId ||
    !targetSchemaVersionId ||
    !hash(input.sourceSha256) ||
    !keyField ||
    !Array.isArray(input.targetFields) ||
    input.targetFields.length === 0 ||
    !Array.isArray(input.sourceRows) ||
    input.sourceRows.length > 1_000_000
  )
    throw new Error('INVALID_MIGRATION_INPUT');
  const targetFields: { readonly key: string; readonly required: boolean }[] = [];
  const targetKeys = new Set<string>();
  for (const raw of input.targetFields) {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_MIGRATION_INPUT');
    const record = raw as Record<string, unknown>;
    const key = text(record['key'], 96);
    const required = record['required'];
    if (!key || targetKeys.has(key) || typeof required !== 'boolean')
      throw new Error('INVALID_MIGRATION_INPUT');
    targetKeys.add(key);
    targetFields.push({ key, required });
  }
  const seenKeys = new Set<string>();
  const records: MigrationDryRunRecordV1[] = [];
  for (const [index, raw] of (input.sourceRows as unknown[]).entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('INVALID_MIGRATION_INPUT');
    const row = raw as Record<string, unknown>;
    const key = row[keyField];
    const reasonCodes: string[] = [];
    const mappedFields: Record<string, unknown> = {};
    for (const field of targetFields) {
      mappedFields[field.key] = row[field.key];
      if (
        field.required &&
        (row[field.key] === undefined || row[field.key] === null || row[field.key] === '')
      )
        reasonCodes.push('REQUIRED_FIELD_MISSING');
    }
    if (key === undefined || key === null || key === '') reasonCodes.push('KEY_MISSING');
    const keyString = String(key);
    if (!reasonCodes.includes('KEY_MISSING') && seenKeys.has(keyString))
      reasonCodes.push('DUPLICATE_KEY');
    if (!reasonCodes.includes('KEY_MISSING')) seenKeys.add(keyString);
    const disposition = reasonCodes.includes('DUPLICATE_KEY')
      ? 'DUPLICATE'
      : reasonCodes.length > 0
        ? 'REJECTED'
        : 'READY';
    records.push(
      Object.freeze({
        rowNumber: index + 1,
        disposition,
        reasonCodes: Object.freeze(reasonCodes),
        mappedFields: Object.freeze(mappedFields),
      }),
    );
  }
  const status = records.some((record) => record.disposition !== 'READY') ? 'BLOCKED' : 'READY';
  return Object.freeze({
    schemaVersion: MIGRATION_READY_SCHEMA_VERSION_V1,
    projectId,
    tenantScope,
    sourceVersionId,
    targetSchemaVersionId,
    status,
    records: Object.freeze(records),
    sourceMutated: false,
    resultHash: fingerprint({ projectId, sourceVersionId, targetSchemaVersionId, records }),
  });
}
