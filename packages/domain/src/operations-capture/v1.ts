import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** OC-001..OC-014: versioned, typed field capture contracts. */
export const OPERATIONS_CAPTURE_SCHEMA_VERSION_V1 = 1 as const;
export type OperationsFieldTypeV1 =
  | 'TEXT'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'DATE'
  | 'PHOTO'
  | 'REFERENCE';
export interface OperationsFormFieldV1 {
  readonly fieldId: StableIdentifierV1;
  readonly key: string;
  readonly label: string;
  readonly type: OperationsFieldTypeV1;
  readonly required: boolean;
}
export interface OperationsFormV1 {
  readonly schemaVersion: typeof OPERATIONS_CAPTURE_SCHEMA_VERSION_V1;
  readonly formId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly version: number;
  readonly name: string;
  readonly fields: readonly OperationsFormFieldV1[];
  readonly state: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
}
export interface OperationsSubmissionV1 {
  readonly schemaVersion: typeof OPERATIONS_CAPTURE_SCHEMA_VERSION_V1;
  readonly submissionId: StableIdentifierV1;
  readonly formId: StableIdentifierV1;
  readonly formVersion: number;
  readonly tenantScope: TenantScopeV1;
  readonly status: 'VALID' | 'INVALID';
  readonly values: Readonly<Record<string, unknown>>;
  readonly errors: readonly string[];
  readonly valueFingerprints: Readonly<Record<string, string>>;
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
function fingerprint(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').repeat(8);
}
function validValue(type: OperationsFieldTypeV1, value: unknown): boolean {
  if (type === 'TEXT' || type === 'REFERENCE')
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 2_000;
  if (type === 'INTEGER') return typeof value === 'number' && Number.isSafeInteger(value);
  if (type === 'DECIMAL') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'BOOLEAN') return typeof value === 'boolean';
  if (type === 'DATE') return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  return typeof value === 'string' && value.length > 0;
}
export function createOperationsFormV1(input: {
  readonly formId: unknown;
  readonly tenantScope: unknown;
  readonly version: unknown;
  readonly name: unknown;
  readonly fields: unknown;
}):
  | { readonly accepted: true; readonly value: OperationsFormV1 }
  | { readonly accepted: false; readonly code: string } {
  const formId = id(input.formId);
  const tenantScope = scope(input.tenantScope);
  const name = text(input.name, 128);
  if (
    !formId ||
    !tenantScope ||
    !name ||
    !Number.isSafeInteger(input.version) ||
    (input.version as number) < 1 ||
    !Array.isArray(input.fields) ||
    input.fields.length === 0 ||
    input.fields.length > 256
  )
    return Object.freeze({ accepted: false, code: 'INVALID_FORM' });
  const keys = new Set<string>();
  const fields: OperationsFormFieldV1[] = [];
  for (const raw of input.fields) {
    if (!raw || typeof raw !== 'object')
      return Object.freeze({ accepted: false, code: 'INVALID_FIELD' });
    const record = raw as Record<string, unknown>;
    const fieldId = id(record['fieldId']);
    const key = text(record['key'], 96);
    const label = text(record['label'], 128);
    const type = record['type'];
    const required = record['required'];
    if (
      !fieldId ||
      !key ||
      keys.has(key) ||
      !label ||
      !['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'PHOTO', 'REFERENCE'].includes(
        String(type),
      ) ||
      typeof required !== 'boolean'
    )
      return Object.freeze({ accepted: false, code: 'INVALID_FIELD' });
    keys.add(key);
    fields.push(
      Object.freeze({ fieldId, key, label, type: type as OperationsFieldTypeV1, required }),
    );
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: OPERATIONS_CAPTURE_SCHEMA_VERSION_V1,
      formId,
      tenantScope,
      version: input.version as number,
      name,
      fields: Object.freeze(fields),
      state: 'DRAFT',
    }),
  });
}
export function validateOperationsSubmissionV1(
  form: OperationsFormV1,
  input: {
    readonly submissionId: unknown;
    readonly tenantScope: unknown;
    readonly values: unknown;
  },
):
  | { readonly accepted: true; readonly value: OperationsSubmissionV1 }
  | { readonly accepted: false; readonly code: string } {
  const submissionId = id(input.submissionId);
  const tenantScope = scope(input.tenantScope);
  if (
    !submissionId ||
    !tenantScope ||
    !tenantScopesEqualV1(form.tenantScope, tenantScope) ||
    !input.values ||
    typeof input.values !== 'object' ||
    Array.isArray(input.values)
  )
    return Object.freeze({ accepted: false, code: 'INVALID_SUBMISSION' });
  const values = input.values as Record<string, unknown>;
  const errors: string[] = [];
  const fingerprints: Record<string, string> = {};
  for (const field of form.fields) {
    const value = values[field.key];
    if (value === undefined || value === null || value === '') {
      if (field.required) errors.push(`REQUIRED:${field.key}`);
      continue;
    }
    if (!validValue(field.type, value)) errors.push(`TYPE:${field.key}`);
    else fingerprints[field.key] = fingerprint(value);
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: OPERATIONS_CAPTURE_SCHEMA_VERSION_V1,
      submissionId,
      formId: form.formId,
      formVersion: form.version,
      tenantScope,
      status: errors.length === 0 ? 'VALID' : 'INVALID',
      values: Object.freeze({ ...values }),
      errors: Object.freeze(errors),
      valueFingerprints: Object.freeze(fingerprints),
    }),
  });
}
