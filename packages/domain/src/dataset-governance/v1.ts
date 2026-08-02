import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** DSM-001..DSM-023, DSM-025..DSM-027: governed definitions and reproducible versions. */
export const DATASET_GOVERNANCE_SCHEMA_VERSION_V1 = 1 as const;

export type GovernedFieldTypeV1 = 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE';
export type GovernedDefinitionStatusV1 = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export type FieldSensitivityV1 = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type DefaultBehaviorV1 = 'MISSING' | 'NULL' | 'STATIC' | 'NONE';
export type QualityStateV1 = 'PASS' | 'PASS_WITH_WARNINGS' | 'BLOCKED' | 'INCOMPLETE';
export type SchemaCompatibilityV1 =
  | 'ADDITIVE_COMPATIBLE'
  | 'VALIDATION_TIGHTENING'
  | 'MIGRATION_REQUIRED'
  | 'BREAKING';

export interface GovernedDatasetFieldV1 {
  readonly fieldId: StableIdentifierV1;
  readonly name: string;
  readonly type: GovernedFieldTypeV1;
  readonly nullable: boolean;
  readonly unit?: string;
  readonly semanticRole?: string;
  readonly aliases: readonly string[];
  readonly localizedLabels: Readonly<Record<string, string>>;
  readonly sensitivity: FieldSensitivityV1;
  readonly defaultBehavior: DefaultBehaviorV1;
}

export interface GovernedDatasetDefinitionV1 {
  readonly schemaVersion: typeof DATASET_GOVERNANCE_SCHEMA_VERSION_V1;
  readonly datasetId: StableIdentifierV1;
  readonly versionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly name: string;
  readonly fields: readonly GovernedDatasetFieldV1[];
  readonly status: GovernedDefinitionStatusV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly publishedAt?: StrictUtcTimestampV1;
  readonly canonicalHash: string;
}

export interface DatasetVersionManifestV1 {
  readonly schemaVersion: typeof DATASET_GOVERNANCE_SCHEMA_VERSION_V1;
  readonly datasetId: StableIdentifierV1;
  readonly versionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly inputArtifactVersionIds: readonly StableIdentifierV1[];
  readonly schemaVersionId: StableIdentifierV1;
  readonly mappingVersionId: StableIdentifierV1;
  readonly ruleSetVersionId: StableIdentifierV1;
  readonly engineBuild: string;
  readonly contentFingerprint: string;
  readonly rowCount: number;
  readonly qualityState: QualityStateV1;
  readonly lineageManifestHash: string;
}

export type DatasetGovernanceErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TEXT'
  | 'INVALID_FIELD'
  | 'DUPLICATE_FIELD'
  | 'INVALID_STATE'
  | 'INVALID_HASH'
  | 'INVALID_COUNT'
  | 'INVALID_QUALITY_STATE'
  | 'INCOMPATIBLE_SCHEMA';

export type DatasetGovernanceResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DatasetGovernanceErrorCodeV1 };

function accepted<TValue>(value: TValue): DatasetGovernanceResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: DatasetGovernanceErrorCodeV1): DatasetGovernanceResultV1<never> {
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

function field(input: unknown): GovernedDatasetFieldV1 | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const fieldId = identifier(record['fieldId']);
  const name = text(record['name'], 128);
  const type = record['type'];
  const nullable = record['nullable'];
  const unit = record['unit'] === undefined ? undefined : text(record['unit'], 64);
  const semanticRole =
    record['semanticRole'] === undefined ? undefined : text(record['semanticRole'], 128);
  const aliasesInput = record['aliases'] === undefined ? [] : record['aliases'];
  const localizedInput = record['localizedLabels'] === undefined ? {} : record['localizedLabels'];
  const sensitivity = record['sensitivity'] ?? 'PUBLIC';
  const defaultBehavior = record['defaultBehavior'] ?? 'NONE';
  if (!fieldId || !name || !['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE'].includes(type as string))
    return undefined;
  if (typeof nullable !== 'boolean') return undefined;
  if (record['unit'] !== undefined && !unit) return undefined;
  if (record['semanticRole'] !== undefined && !semanticRole) return undefined;
  if (!Array.isArray(aliasesInput) || aliasesInput.length > 32) return undefined;
  const aliases = aliasesInput.map((alias) => text(alias, 128));
  if (aliases.some((alias): alias is undefined => alias === undefined)) return undefined;
  if (
    typeof localizedInput !== 'object' ||
    localizedInput === null ||
    Array.isArray(localizedInput)
  )
    return undefined;
  const localizedLabels: Record<string, string> = {};
  for (const [locale, label] of Object.entries(localizedInput)) {
    const safeLocale = text(locale, 16);
    const safeLabel = text(label, 255);
    if (!safeLocale || !safeLabel) return undefined;
    localizedLabels[safeLocale] = safeLabel;
  }
  if (!['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'].includes(sensitivity as string))
    return undefined;
  if (!['MISSING', 'NULL', 'STATIC', 'NONE'].includes(defaultBehavior as string)) return undefined;
  return Object.freeze({
    fieldId,
    name,
    type: type as GovernedFieldTypeV1,
    nullable,
    ...(unit ? { unit } : {}),
    ...(semanticRole ? { semanticRole } : {}),
    aliases: Object.freeze(aliases as string[]),
    localizedLabels: Object.freeze(localizedLabels),
    sensitivity: sensitivity as FieldSensitivityV1,
    defaultBehavior: defaultBehavior as DefaultBehaviorV1,
  });
}

export function createGovernedDatasetDefinitionV1(input: {
  readonly datasetId: unknown;
  readonly versionId: unknown;
  readonly tenantScope: unknown;
  readonly name: unknown;
  readonly fields: unknown;
  readonly status?: unknown;
  readonly createdAt: unknown;
  readonly publishedAt?: unknown;
  readonly canonicalHash: unknown;
}): DatasetGovernanceResultV1<GovernedDatasetDefinitionV1> {
  const datasetId = identifier(input.datasetId);
  const versionId = identifier(input.versionId);
  const tenantScope = scope(input.tenantScope);
  const name = text(input.name, 200);
  const createdAt = timestamp(input.createdAt);
  const publishedAt = input.publishedAt === undefined ? undefined : timestamp(input.publishedAt);
  const canonicalHash = hash(input.canonicalHash);
  if (!datasetId || !versionId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!name) return rejected('INVALID_TEXT');
  if (!Array.isArray(input.fields) || input.fields.length === 0 || input.fields.length > 256)
    return rejected('INVALID_FIELD');
  const fields = input.fields.map(field);
  if (fields.some((candidate): candidate is undefined => candidate === undefined))
    return rejected('INVALID_FIELD');
  const validFields = fields as GovernedDatasetFieldV1[];
  const fieldIds = new Set(validFields.map((candidate) => candidate.fieldId));
  const fieldNames = new Set(validFields.map((candidate) => candidate.name));
  if (fieldIds.size !== validFields.length || fieldNames.size !== validFields.length)
    return rejected('DUPLICATE_FIELD');
  if (!createdAt || (input.publishedAt !== undefined && !publishedAt))
    return rejected('INVALID_TIMESTAMP');
  const status = input.status ?? 'DRAFT';
  if (!['DRAFT', 'PUBLISHED', 'RETIRED'].includes(status as string)) return rejected('INVALID_STATE');
  if (!canonicalHash) return rejected('INVALID_HASH');
  if (publishedAt && Date.parse(publishedAt) < Date.parse(createdAt))
    return rejected('INVALID_TIMESTAMP');
  return accepted(
    Object.freeze({
      schemaVersion: DATASET_GOVERNANCE_SCHEMA_VERSION_V1,
      datasetId,
      versionId,
      tenantScope,
      name,
      fields: Object.freeze(validFields),
      status: status as GovernedDefinitionStatusV1,
      createdAt,
      ...(publishedAt ? { publishedAt } : {}),
      canonicalHash,
    }),
  );
}

export function compareGovernedSchemaCompatibilityV1(
  previous: GovernedDatasetDefinitionV1,
  next: GovernedDatasetDefinitionV1,
): DatasetGovernanceResultV1<SchemaCompatibilityV1> {
  if (previous.datasetId !== next.datasetId || !tenantScopesEqualV1(previous.tenantScope, next.tenantScope))
    return rejected('INCOMPATIBLE_SCHEMA');
  const nextById = new Map(next.fields.map((candidate) => [candidate.fieldId, candidate]));
  let classification: SchemaCompatibilityV1 = 'ADDITIVE_COMPATIBLE';
  for (const prior of previous.fields) {
    const candidate = nextById.get(prior.fieldId);
    if (!candidate || candidate.name !== prior.name || candidate.type !== prior.type)
      return accepted('BREAKING');
    if (prior.nullable && !candidate.nullable) classification = 'VALIDATION_TIGHTENING';
  }
  for (const candidate of next.fields) {
    if (!previous.fields.some((prior) => prior.fieldId === candidate.fieldId)) {
      if (!candidate.nullable) classification = 'MIGRATION_REQUIRED';
    }
  }
  return accepted(classification);
}

export function createDatasetVersionManifestV1(input: {
  readonly datasetId: unknown;
  readonly versionId: unknown;
  readonly tenantScope: unknown;
  readonly inputArtifactVersionIds: unknown;
  readonly schemaVersionId: unknown;
  readonly mappingVersionId: unknown;
  readonly ruleSetVersionId: unknown;
  readonly engineBuild: unknown;
  readonly contentFingerprint: unknown;
  readonly rowCount: unknown;
  readonly qualityState: unknown;
  readonly lineageManifestHash: unknown;
}): DatasetGovernanceResultV1<DatasetVersionManifestV1> {
  const datasetId = identifier(input.datasetId);
  const versionId = identifier(input.versionId);
  const tenantScope = scope(input.tenantScope);
  const schemaVersionId = identifier(input.schemaVersionId);
  const mappingVersionId = identifier(input.mappingVersionId);
  const ruleSetVersionId = identifier(input.ruleSetVersionId);
  const contentFingerprint = hash(input.contentFingerprint);
  const lineageManifestHash = hash(input.lineageManifestHash);
  const engineBuild = text(input.engineBuild, 128);
  if (!datasetId || !versionId || !schemaVersionId || !mappingVersionId || !ruleSetVersionId)
    return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!Array.isArray(input.inputArtifactVersionIds) || input.inputArtifactVersionIds.length > 1024)
    return rejected('INVALID_IDENTIFIER');
  const inputArtifactVersionIds = input.inputArtifactVersionIds.map(identifier);
  if (inputArtifactVersionIds.some((candidate): candidate is undefined => candidate === undefined))
    return rejected('INVALID_IDENTIFIER');
  if (!engineBuild || !contentFingerprint || !lineageManifestHash) return rejected('INVALID_TEXT');
  if (
    typeof input.rowCount !== 'number' ||
    !Number.isSafeInteger(input.rowCount) ||
    input.rowCount < 0
  )
    return rejected('INVALID_COUNT');
  if (!['PASS', 'PASS_WITH_WARNINGS', 'BLOCKED', 'INCOMPLETE'].includes(input.qualityState as string))
    return rejected('INVALID_QUALITY_STATE');
  return accepted(
    Object.freeze({
      schemaVersion: DATASET_GOVERNANCE_SCHEMA_VERSION_V1,
      datasetId,
      versionId,
      tenantScope,
      inputArtifactVersionIds: Object.freeze(inputArtifactVersionIds as StableIdentifierV1[]),
      schemaVersionId,
      mappingVersionId,
      ruleSetVersionId,
      engineBuild,
      contentFingerprint,
      rowCount: input.rowCount,
      qualityState: input.qualityState as QualityStateV1,
      lineageManifestHash,
    }),
  );
}
