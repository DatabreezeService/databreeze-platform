import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** DSM-001..DSM-027: governed dataset definitions and compatible schema versions. */
export const DATASET_SCHEMA_VERSION_V1 = 1 as const;

export type DatasetFieldTypeV1 = 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE';
export type DatasetDefinitionStatusV1 = 'DRAFT' | 'PUBLISHED' | 'RETIRED';

export interface DatasetFieldV1 {
  readonly name: string;
  readonly type: DatasetFieldTypeV1;
  readonly required: boolean;
  readonly semanticKey?: string;
}

export interface DatasetDefinitionV1 {
  readonly schemaVersion: typeof DATASET_SCHEMA_VERSION_V1;
  readonly datasetId: StableIdentifierV1;
  readonly versionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly name: string;
  readonly fields: readonly DatasetFieldV1[];
  readonly status: DatasetDefinitionStatusV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly publishedAt?: StrictUtcTimestampV1;
}

export type DatasetErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TEXT'
  | 'INVALID_FIELD'
  | 'DUPLICATE_FIELD'
  | 'INVALID_STATE'
  | 'INCOMPATIBLE_SCHEMA';

export type DatasetResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DatasetErrorCodeV1 };

function rejected(code: DatasetErrorCodeV1): DatasetResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const result = parseStableIdentifierV1(input);
  return result.accepted ? result.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const result = parseStrictUtcTimestampV1(input);
  return result.accepted ? result.value : undefined;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

const fieldTypes = new Set<DatasetFieldTypeV1>(['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE']);

function fields(input: unknown): readonly DatasetFieldV1[] | undefined {
  if (!Array.isArray(input) || input.length === 0 || input.length > 256) return undefined;
  const names = new Set<string>();
  const result: DatasetFieldV1[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined;
    const record = item as Record<string, unknown>;
    const name = text(record['name'], 128);
    const type = record['type'];
    const required = record['required'];
    const semanticKey =
      record['semanticKey'] === undefined ? undefined : text(record['semanticKey'], 128);
    if (!name || !fieldTypes.has(type as DatasetFieldTypeV1) || typeof required !== 'boolean')
      return undefined;
    if (semanticKey === undefined && record['semanticKey'] !== undefined) return undefined;
    if (names.has(name)) return undefined;
    names.add(name);
    result.push(
      Object.freeze({
        name,
        type: type as DatasetFieldTypeV1,
        required,
        ...(semanticKey ? { semanticKey } : {}),
      }),
    );
  }
  return Object.freeze(result);
}

export function createDatasetDefinitionV1(input: {
  readonly datasetId: unknown;
  readonly versionId: unknown;
  readonly tenantScope: unknown;
  readonly name: unknown;
  readonly fields: unknown;
  readonly createdAt: unknown;
  readonly status?: unknown;
}): DatasetResultV1<DatasetDefinitionV1> {
  const datasetId = stable(input.datasetId);
  const versionId = stable(input.versionId);
  const tenantScope = parseTenantScopeV1(input.tenantScope);
  const name = text(input.name, 200);
  const datasetFields = fields(input.fields);
  const createdAt = timestamp(input.createdAt);
  const status = input.status ?? 'DRAFT';
  if (!datasetId || !versionId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope.accepted) return rejected('INVALID_SCOPE');
  if (!name) return rejected('INVALID_TEXT');
  if (!datasetFields) return rejected('INVALID_FIELD');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (status !== 'DRAFT' && status !== 'PUBLISHED' && status !== 'RETIRED')
    return rejected('INVALID_STATE');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: DATASET_SCHEMA_VERSION_V1,
      datasetId,
      versionId,
      tenantScope: tenantScope.value,
      name,
      fields: datasetFields,
      status,
      createdAt,
    }),
  });
}

export function publishDatasetDefinitionV1(
  definition: DatasetDefinitionV1,
  publishedAtInput: unknown,
): DatasetResultV1<DatasetDefinitionV1> {
  const publishedAt = timestamp(publishedAtInput);
  if (!publishedAt) return rejected('INVALID_TIMESTAMP');
  if (definition.status !== 'DRAFT') return rejected('INVALID_STATE');
  if (Date.parse(publishedAt) < Date.parse(definition.createdAt))
    return rejected('INVALID_TIMESTAMP');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({ ...definition, status: 'PUBLISHED' as const, publishedAt }),
  });
}

export function areDatasetSchemasCompatibleV1(
  previous: DatasetDefinitionV1,
  next: DatasetDefinitionV1,
): DatasetResultV1<true> {
  if (
    previous.datasetId !== next.datasetId ||
    previous.tenantScope.scopeType !== next.tenantScope.scopeType
  )
    return rejected('INCOMPATIBLE_SCHEMA');
  const priorFields = new Map(previous.fields.map((field) => [field.name, field]));
  for (const field of next.fields) {
    const prior = priorFields.get(field.name);
    if (prior && (prior.type !== field.type || (prior.required && !field.required)))
      return rejected('INCOMPATIBLE_SCHEMA');
  }
  return Object.freeze({ accepted: true, value: true });
}
