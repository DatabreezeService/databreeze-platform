import { parseStableIdentifierV1, type StableIdentifierV1 } from '../tenant-scope/v1.js';

/** EI-001..EI-012: schema- and origin-governed embedded import validation. */
export const EMBEDDED_IMPORTER_SCHEMA_VERSION_V1 = 1 as const;
export type EmbeddedImportFieldTypeV1 = 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE';
export interface EmbeddedImportFieldV1 {
  readonly key: string;
  readonly type: EmbeddedImportFieldTypeV1;
  readonly required: boolean;
}
export interface EmbeddedImportSchemaV1 {
  readonly schemaVersion: typeof EMBEDDED_IMPORTER_SCHEMA_VERSION_V1;
  readonly schemaId: StableIdentifierV1;
  readonly version: number;
  readonly name: string;
  readonly allowedOrigins: readonly string[];
  readonly fields: readonly EmbeddedImportFieldV1[];
}
export interface EmbeddedImportResultV1 {
  readonly schemaVersion: typeof EMBEDDED_IMPORTER_SCHEMA_VERSION_V1;
  readonly importId: StableIdentifierV1;
  readonly schemaId: StableIdentifierV1;
  readonly schemaVersionNumber: number;
  readonly origin: string;
  readonly status: 'ACCEPTED' | 'REJECTED';
  readonly recordsAccepted: number;
  readonly errors: readonly string[];
  readonly inputFingerprint: string;
}
function id(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
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
function valid(type: EmbeddedImportFieldTypeV1, value: unknown): boolean {
  if (type === 'TEXT') return typeof value === 'string' && value.length <= 4_000;
  if (type === 'INTEGER') return typeof value === 'number' && Number.isSafeInteger(value);
  if (type === 'DECIMAL') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'BOOLEAN') return typeof value === 'boolean';
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
export function createEmbeddedImportSchemaV1(input: {
  readonly schemaId: unknown;
  readonly version: unknown;
  readonly name: unknown;
  readonly allowedOrigins: unknown;
  readonly fields: unknown;
}):
  | { readonly accepted: true; readonly value: EmbeddedImportSchemaV1 }
  | { readonly accepted: false; readonly code: string } {
  const schemaId = id(input.schemaId);
  const name = text(input.name, 128);
  if (
    !schemaId ||
    !name ||
    !Number.isSafeInteger(input.version) ||
    (input.version as number) < 1 ||
    !Array.isArray(input.allowedOrigins) ||
    input.allowedOrigins.length === 0 ||
    input.allowedOrigins.length > 32 ||
    input.allowedOrigins.some(
      (origin) => !text(origin, 256) || !/^https:\/\/[^*?]+$/u.test(origin as string),
    ) ||
    !Array.isArray(input.fields) ||
    input.fields.length === 0 ||
    input.fields.length > 256
  )
    return Object.freeze({ accepted: false, code: 'INVALID_SCHEMA' });
  const keys = new Set<string>();
  const fields: EmbeddedImportFieldV1[] = [];
  for (const raw of input.fields) {
    if (!raw || typeof raw !== 'object')
      return Object.freeze({ accepted: false, code: 'INVALID_FIELD' });
    const record = raw as Record<string, unknown>;
    const key = text(record['key'], 96);
    const type = record['type'];
    const required = record['required'];
    if (
      !key ||
      keys.has(key) ||
      !['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE'].includes(String(type)) ||
      typeof required !== 'boolean'
    )
      return Object.freeze({ accepted: false, code: 'INVALID_FIELD' });
    keys.add(key);
    fields.push(Object.freeze({ key, type: type as EmbeddedImportFieldTypeV1, required }));
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: EMBEDDED_IMPORTER_SCHEMA_VERSION_V1,
      schemaId,
      version: input.version as number,
      name,
      allowedOrigins: Object.freeze(
        (input.allowedOrigins as string[]).map((origin) => origin.trim()),
      ),
      fields: Object.freeze(fields),
    }),
  });
}
export function validateEmbeddedImportV1(
  schema: EmbeddedImportSchemaV1,
  input: { readonly importId: unknown; readonly origin: unknown; readonly records: unknown },
):
  | { readonly accepted: true; readonly value: EmbeddedImportResultV1 }
  | { readonly accepted: false; readonly code: string } {
  const importId = id(input.importId);
  const origin = text(input.origin, 256);
  if (
    !importId ||
    !origin ||
    !schema.allowedOrigins.includes(origin) ||
    !Array.isArray(input.records) ||
    input.records.length > 100_000
  )
    return Object.freeze({ accepted: false, code: 'ORIGIN_OR_INPUT_REJECTED' });
  const errors: string[] = [];
  let recordsAccepted = 0;
  for (const [index, raw] of (input.records as unknown[]).entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(`ROW_${index + 1}_INVALID`);
      continue;
    }
    const record = raw as Record<string, unknown>;
    let validRecord = true;
    for (const field of schema.fields) {
      const value = record[field.key];
      if (value === undefined || value === null || value === '') {
        if (field.required) {
          validRecord = false;
          errors.push(`ROW_${index + 1}_REQUIRED_${field.key}`);
        }
        continue;
      }
      if (!valid(field.type, value)) {
        validRecord = false;
        errors.push(`ROW_${index + 1}_TYPE_${field.key}`);
      }
    }
    if (validRecord) recordsAccepted += 1;
  }
  const status = errors.length === 0 ? 'ACCEPTED' : 'REJECTED';
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: EMBEDDED_IMPORTER_SCHEMA_VERSION_V1,
      importId,
      schemaId: schema.schemaId,
      schemaVersionNumber: schema.version,
      origin,
      status,
      recordsAccepted,
      errors: Object.freeze(errors.slice(0, 512)),
      inputFingerprint: fingerprint({
        schemaId: schema.schemaId,
        schemaVersion: schema.version,
        origin,
        records: input.records,
      }),
    }),
  });
}
