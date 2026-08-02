import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** DSM-007, DSM-008: deterministic, declarative field mappings. */
export const MAPPING_SCHEMA_VERSION_V1 = 1 as const;

export type MappingStatusV1 = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export type MappingTransformV1 =
  | 'IDENTITY'
  | 'TRIM'
  | 'LOWERCASE'
  | 'UPPERCASE'
  | 'PARSE_DECIMAL'
  | 'PARSE_DATE'
  | 'LOOKUP';

export interface MappingStepV1 {
  readonly sourceFieldId: StableIdentifierV1;
  readonly targetFieldId: StableIdentifierV1;
  readonly transform: MappingTransformV1;
  readonly lookupVersionId?: StableIdentifierV1;
}

export interface MappingDefinitionV1 {
  readonly schemaVersion: typeof MAPPING_SCHEMA_VERSION_V1;
  readonly datasetId: StableIdentifierV1;
  readonly versionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly sourceSchemaVersionId: StableIdentifierV1;
  readonly targetSchemaVersionId: StableIdentifierV1;
  readonly steps: readonly MappingStepV1[];
  readonly status: MappingStatusV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly publishedAt?: StrictUtcTimestampV1;
  readonly canonicalHash: string;
}

export type MappingErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_HASH'
  | 'INVALID_STATE'
  | 'INVALID_STEP'
  | 'DUPLICATE_MAPPING'
  | 'LOOKUP_REQUIRED';

export type MappingResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: MappingErrorCodeV1 };

function accepted<TValue>(value: TValue): MappingResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: MappingErrorCodeV1): MappingResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function identifier(input: unknown): StableIdentifierV1 | undefined {
  const result = parseStableIdentifierV1(input);
  return result.accepted ? result.value : undefined;
}

function scope(input: unknown): TenantScopeV1 | undefined {
  const result = parseTenantScopeV1(input);
  return result.accepted ? result.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const result = parseStrictUtcTimestampV1(input);
  return result.accepted ? result.value : undefined;
}

function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input)
    ? input.toLowerCase()
    : undefined;
}

function mappingStep(input: unknown): MappingStepV1 | MappingErrorCodeV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return 'INVALID_STEP';
  const record = input as Record<string, unknown>;
  const sourceFieldId = identifier(record['sourceFieldId']);
  const targetFieldId = identifier(record['targetFieldId']);
  const transform = record['transform'];
  const lookupVersionId =
    record['lookupVersionId'] === undefined ? undefined : identifier(record['lookupVersionId']);
  if (
    !sourceFieldId ||
    !targetFieldId ||
    ![
      'IDENTITY',
      'TRIM',
      'LOWERCASE',
      'UPPERCASE',
      'PARSE_DECIMAL',
      'PARSE_DATE',
      'LOOKUP',
    ].includes(transform as string)
  )
    return 'INVALID_STEP';
  if (record['lookupVersionId'] !== undefined && !lookupVersionId) return 'INVALID_IDENTIFIER';
  if (transform === 'LOOKUP' && !lookupVersionId) return 'LOOKUP_REQUIRED';
  return Object.freeze({
    sourceFieldId,
    targetFieldId,
    transform: transform as MappingTransformV1,
    ...(lookupVersionId ? { lookupVersionId } : {}),
  });
}

export function createMappingDefinitionV1(input: {
  readonly datasetId: unknown;
  readonly versionId: unknown;
  readonly tenantScope: unknown;
  readonly sourceSchemaVersionId: unknown;
  readonly targetSchemaVersionId: unknown;
  readonly steps: unknown;
  readonly status?: unknown;
  readonly createdAt: unknown;
  readonly publishedAt?: unknown;
  readonly canonicalHash: unknown;
}): MappingResultV1<MappingDefinitionV1> {
  const datasetId = identifier(input.datasetId);
  const versionId = identifier(input.versionId);
  const tenantScope = scope(input.tenantScope);
  const sourceSchemaVersionId = identifier(input.sourceSchemaVersionId);
  const targetSchemaVersionId = identifier(input.targetSchemaVersionId);
  const createdAt = timestamp(input.createdAt);
  const publishedAt = input.publishedAt === undefined ? undefined : timestamp(input.publishedAt);
  const canonicalHash = hash(input.canonicalHash);
  if (!datasetId || !versionId || !sourceSchemaVersionId || !targetSchemaVersionId)
    return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!createdAt || (input.publishedAt !== undefined && !publishedAt))
    return rejected('INVALID_TIMESTAMP');
  if (publishedAt && Date.parse(publishedAt) < Date.parse(createdAt))
    return rejected('INVALID_TIMESTAMP');
  if (!canonicalHash) return rejected('INVALID_HASH');
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > 512)
    return rejected('INVALID_STEP');
  const parsedSteps = input.steps.map(mappingStep);
  if (parsedSteps.some((step): step is MappingErrorCodeV1 => typeof step === 'string'))
    return rejected(
      parsedSteps.find((step): step is MappingErrorCodeV1 => typeof step === 'string') ??
        'INVALID_STEP',
    );
  const steps = parsedSteps as MappingStepV1[];
  const targets = new Set(steps.map((step) => step.targetFieldId));
  if (targets.size !== steps.length) return rejected('DUPLICATE_MAPPING');
  const status = input.status ?? 'DRAFT';
  if (!['DRAFT', 'PUBLISHED', 'RETIRED'].includes(status as string))
    return rejected('INVALID_STATE');
  return accepted(
    Object.freeze({
      schemaVersion: MAPPING_SCHEMA_VERSION_V1,
      datasetId,
      versionId,
      tenantScope,
      sourceSchemaVersionId,
      targetSchemaVersionId,
      steps: Object.freeze(steps),
      status: status as MappingStatusV1,
      createdAt,
      ...(publishedAt ? { publishedAt } : {}),
      canonicalHash,
    }),
  );
}

export function publishMappingDefinitionV1(
  definition: MappingDefinitionV1,
  nextVersionIdInput: unknown,
  publishedAtInput: unknown,
): MappingResultV1<MappingDefinitionV1> {
  const nextVersionId = identifier(nextVersionIdInput);
  const publishedAt = timestamp(publishedAtInput);
  if (!nextVersionId) return rejected('INVALID_IDENTIFIER');
  if (!publishedAt || Date.parse(publishedAt) < Date.parse(definition.createdAt))
    return rejected('INVALID_TIMESTAMP');
  if (definition.status !== 'DRAFT') return rejected('INVALID_STATE');
  return accepted(
    Object.freeze({
      ...definition,
      versionId: nextVersionId,
      status: 'PUBLISHED' as const,
      publishedAt,
    }),
  );
}
