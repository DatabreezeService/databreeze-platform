import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** DSM-009, DSM-010, DSM-011, DSM-015: bounded declarative quality rules. */
export const RULE_SET_SCHEMA_VERSION_V1 = 1 as const;

export type RuleSetStatusV1 = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export type RuleSeverityV1 = 'ERROR' | 'WARNING';
export type RuleKindV1 = 'REQUIRED' | 'TYPE' | 'RANGE' | 'UNIQUE' | 'REFERENCE';
export type RuleTypeV1 = 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE';

export type RuleParametersV1 =
  | Readonly<Record<string, never>>
  | { readonly expectedType: RuleTypeV1 }
  | { readonly minimum?: number; readonly maximum?: number }
  | { readonly referenceEntityVersionId: StableIdentifierV1 };

export interface QualityRuleV1 {
  readonly ruleId: StableIdentifierV1;
  readonly fieldId: StableIdentifierV1;
  readonly kind: RuleKindV1;
  readonly severity: RuleSeverityV1;
  readonly parameters: RuleParametersV1;
}

export interface RuleSetDefinitionV1 {
  readonly schemaVersion: typeof RULE_SET_SCHEMA_VERSION_V1;
  readonly datasetId: StableIdentifierV1;
  readonly versionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly schemaVersionId: StableIdentifierV1;
  readonly rules: readonly QualityRuleV1[];
  readonly status: RuleSetStatusV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly publishedAt?: StrictUtcTimestampV1;
  readonly canonicalHash: string;
}

export type RuleSetErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_HASH'
  | 'INVALID_STATE'
  | 'INVALID_RULE'
  | 'DUPLICATE_RULE'
  | 'INVALID_PARAMETERS';

export type RuleSetResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: RuleSetErrorCodeV1 };

function accepted<TValue>(value: TValue): RuleSetResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: RuleSetErrorCodeV1): RuleSetResultV1<never> {
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
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input) ? input.toLowerCase() : undefined;
}

function rule(input: unknown): QualityRuleV1 | RuleSetErrorCodeV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return 'INVALID_RULE';
  const record = input as Record<string, unknown>;
  const ruleId = identifier(record['ruleId']);
  const fieldId = identifier(record['fieldId']);
  const kind = record['kind'];
  const severity = record['severity'];
  const parameters = record['parameters'] ?? {};
  if (!ruleId || !fieldId || !['REQUIRED', 'TYPE', 'RANGE', 'UNIQUE', 'REFERENCE'].includes(kind as string)) return 'INVALID_RULE';
  if (!['ERROR', 'WARNING'].includes(severity as string)) return 'INVALID_RULE';
  if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) return 'INVALID_PARAMETERS';
  if (kind === 'TYPE') {
    if (!['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE'].includes((parameters as Record<string, unknown>)['expectedType'] as string)) return 'INVALID_PARAMETERS';
  } else if (kind === 'RANGE') {
    const range = parameters as Record<string, unknown>;
    const minimum = range['minimum'];
    const maximum = range['maximum'];
    if ((minimum !== undefined && (typeof minimum !== 'number' || !Number.isFinite(minimum))) || (maximum !== undefined && (typeof maximum !== 'number' || !Number.isFinite(maximum))) || (minimum === undefined && maximum === undefined) || (minimum !== undefined && maximum !== undefined && minimum > maximum)) return 'INVALID_PARAMETERS';
  } else if (kind === 'REFERENCE') {
    if (!identifier((parameters as Record<string, unknown>)['referenceEntityVersionId'])) return 'INVALID_PARAMETERS';
  } else if (Object.keys(parameters as object).length > 0) {
    return 'INVALID_PARAMETERS';
  }
  return Object.freeze({ ruleId, fieldId, kind: kind as RuleKindV1, severity: severity as RuleSeverityV1, parameters: Object.freeze({ ...(parameters as Record<string, unknown>) }) as RuleParametersV1 });
}

export function createRuleSetDefinitionV1(input: {
  readonly datasetId: unknown;
  readonly versionId: unknown;
  readonly tenantScope: unknown;
  readonly schemaVersionId: unknown;
  readonly rules: unknown;
  readonly status?: unknown;
  readonly createdAt: unknown;
  readonly publishedAt?: unknown;
  readonly canonicalHash: unknown;
}): RuleSetResultV1<RuleSetDefinitionV1> {
  const datasetId = identifier(input.datasetId);
  const versionId = identifier(input.versionId);
  const tenantScope = scope(input.tenantScope);
  const schemaVersionId = identifier(input.schemaVersionId);
  const createdAt = timestamp(input.createdAt);
  const publishedAt = input.publishedAt === undefined ? undefined : timestamp(input.publishedAt);
  const canonicalHash = hash(input.canonicalHash);
  if (!datasetId || !versionId || !schemaVersionId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!createdAt || (input.publishedAt !== undefined && !publishedAt)) return rejected('INVALID_TIMESTAMP');
  if (publishedAt && Date.parse(publishedAt) < Date.parse(createdAt)) return rejected('INVALID_TIMESTAMP');
  if (!canonicalHash) return rejected('INVALID_HASH');
  if (!Array.isArray(input.rules) || input.rules.length === 0 || input.rules.length > 512) return rejected('INVALID_RULE');
  const parsedRules = input.rules.map(rule);
  if (parsedRules.some((candidate): candidate is RuleSetErrorCodeV1 => typeof candidate === 'string')) return rejected(parsedRules.find((candidate): candidate is RuleSetErrorCodeV1 => typeof candidate === 'string') ?? 'INVALID_RULE');
  const rules = parsedRules as QualityRuleV1[];
  if (new Set(rules.map((candidate) => candidate.ruleId)).size !== rules.length) return rejected('DUPLICATE_RULE');
  const status = input.status ?? 'DRAFT';
  if (!['DRAFT', 'PUBLISHED', 'RETIRED'].includes(status as string)) return rejected('INVALID_STATE');
  return accepted(Object.freeze({ schemaVersion: RULE_SET_SCHEMA_VERSION_V1, datasetId, versionId, tenantScope, schemaVersionId, rules: Object.freeze(rules), status: status as RuleSetStatusV1, createdAt, ...(publishedAt ? { publishedAt } : {}), canonicalHash }));
}

export function publishRuleSetDefinitionV1(definition: RuleSetDefinitionV1, nextVersionIdInput: unknown, publishedAtInput: unknown): RuleSetResultV1<RuleSetDefinitionV1> {
  const nextVersionId = identifier(nextVersionIdInput);
  const publishedAt = timestamp(publishedAtInput);
  if (!nextVersionId) return rejected('INVALID_IDENTIFIER');
  if (!publishedAt || Date.parse(publishedAt) < Date.parse(definition.createdAt)) return rejected('INVALID_TIMESTAMP');
  if (definition.status !== 'DRAFT') return rejected('INVALID_STATE');
  return accepted(Object.freeze({ ...definition, versionId: nextVersionId, status: 'PUBLISHED' as const, publishedAt }));
}
