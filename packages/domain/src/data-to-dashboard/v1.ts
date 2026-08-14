import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** DDA-001..DDA-060: versioned dashboard-agent vocabulary and immutable constructors. */
export const DDA_SCHEMA_VERSION_V1 = 1 as const;

export type DdaDataClassificationV1 = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

export type DdaTransformationKindV1 =
  | 'SELECT_COLUMNS'
  | 'RENAME_COLUMNS'
  | 'TRIM_TEXT'
  | 'NORMALIZE_TEXT'
  | 'PARSE_DATE'
  | 'PARSE_TIME'
  | 'PARSE_NUMBER'
  | 'PARSE_CURRENCY'
  | 'CAST_TYPE'
  | 'REPLACE_NULL'
  | 'FILTER_ROWS'
  | 'DEDUPLICATE'
  | 'DERIVE_FIELD'
  | 'UNION_COMPATIBLE'
  | 'LOOKUP_JOIN'
  | 'AGGREGATE';

export type DdaFreshnessPolicyV1 = 'ON_CHANGE' | 'MANUAL' | 'SCHEDULED';
export type DdaPublicationPolicyV1 = 'DRAFT_ONLY' | 'REVIEWED' | 'CERTIFIED';
export type DdaWidgetTypeV1 =
  | 'KPI'
  | 'TABLE'
  | 'BAR'
  | 'LINE'
  | 'AREA'
  | 'PIE'
  | 'DONUT'
  | 'TEXT_NOTE'
  | 'EVIDENCE_NOTE';
export type DdaFreshnessStateV1 = 'FRESH' | 'STALE' | 'PENDING' | 'BLOCKED' | 'SOURCE_UNAVAILABLE';
export type DdaEvidenceStateV1 = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
export type DdaAudienceV1 = 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS' | 'SHARED_LINK';
export type DdaTimeGrainV1 = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
export type DdaOutputFormV1 = 'TABLE' | 'KPI' | 'CHART' | 'EVIDENCE';

export interface LocalizedTextV1 {
  readonly vi: string;
  readonly en: string;
}

export interface DdaTransformationStepV1 {
  readonly stepId: StableIdentifierV1;
  readonly kind: DdaTransformationKindV1;
  readonly inputs: readonly StableIdentifierV1[];
  readonly config: Readonly<Record<string, string | number | boolean | null>>;
}

export interface DdaEtlPlanV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly planId: StableIdentifierV1;
  readonly planVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly inputArtifactVersionId: StableIdentifierV1;
  readonly schemaVersionId: StableIdentifierV1;
  readonly mappingVersionId: StableIdentifierV1;
  readonly ruleSetVersionId: StableIdentifierV1;
  readonly engineBindingId: StableIdentifierV1;
  readonly transformations: readonly DdaTransformationStepV1[];
  readonly contentHash: string;
  readonly schemaHash: string;
  readonly dataClassification: DdaDataClassificationV1;
  readonly dataModePolicyVersionId: StableIdentifierV1;
  readonly retentionReferenceId: StableIdentifierV1;
  readonly evidenceReferenceId: StableIdentifierV1;
  readonly createdAt: StrictUtcTimestampV1;
}

export interface DdaAnalysisPlanV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly planId: StableIdentifierV1;
  readonly planVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly semanticVersionId: StableIdentifierV1;
  readonly metricVersionId: StableIdentifierV1;
  readonly dimensions: readonly string[];
  readonly filters: readonly Readonly<Record<string, string>>[];
  readonly timeRange: { readonly start: StrictUtcTimestampV1; readonly end: StrictUtcTimestampV1 };
  readonly timeGrain: DdaTimeGrainV1;
  readonly joins: readonly Readonly<Record<string, string>>[];
  readonly units: Readonly<Record<string, string>>;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly output: { readonly form: DdaOutputFormV1; readonly maxRows: number };
  readonly assumptions: readonly string[];
  readonly estimate: { readonly cpuMs: number; readonly memoryMb: number };
  readonly permissionProjectionVersionId: StableIdentifierV1;
  readonly planHash: string;
  readonly createdAt: StrictUtcTimestampV1;
}

export interface DashboardLayoutCellV1 {
  readonly widgetId: StableIdentifierV1;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface DashboardPageV1 {
  readonly pageId: StableIdentifierV1;
  readonly order: number;
  readonly title: LocalizedTextV1;
  readonly layout: {
    readonly desktop: readonly DashboardLayoutCellV1[];
    readonly tablet: readonly DashboardLayoutCellV1[];
    readonly mobile: readonly DashboardLayoutCellV1[];
  };
}

export interface DashboardWidgetV1 {
  readonly widgetId: StableIdentifierV1;
  readonly type: DdaWidgetTypeV1;
  readonly pageId: StableIdentifierV1;
  readonly binding: {
    readonly analysisPlanVersionId: StableIdentifierV1;
    readonly materializationDefinitionId: StableIdentifierV1;
  };
  readonly title: LocalizedTextV1;
}

export interface DashboardFilterV1 {
  readonly filterId: StableIdentifierV1;
  readonly field: string;
  readonly operator: string;
  readonly scope: 'DASHBOARD' | 'PAGE' | 'WIDGET';
}

export interface DashboardDatasetBindingV1 {
  readonly datasetVersionId: StableIdentifierV1;
  readonly semanticVersionId: StableIdentifierV1;
  readonly metricVersionId: StableIdentifierV1;
}

export interface DashboardVersionV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly dashboardId: StableIdentifierV1;
  readonly versionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly parentVersionId?: StableIdentifierV1;
  readonly pages: readonly DashboardPageV1[];
  readonly widgets: readonly DashboardWidgetV1[];
  readonly filters: readonly DashboardFilterV1[];
  readonly datasetBindings: readonly DashboardDatasetBindingV1[];
  readonly locale: string;
  readonly timezone: string;
  readonly freshnessPolicy: DdaFreshnessPolicyV1;
  readonly publicationPolicy: DdaPublicationPolicyV1;
  readonly canonicalHash: string;
  readonly createdAt: StrictUtcTimestampV1;
}

export interface DdaMaterializationV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly materializationId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly dashboardVersionId: StableIdentifierV1;
  readonly widgetId: StableIdentifierV1;
  readonly analysisPlanVersionId: StableIdentifierV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly semanticVersionId: StableIdentifierV1;
  readonly metricVersionId: StableIdentifierV1;
  readonly permissionProjectionVersionId: StableIdentifierV1;
  readonly parameterHash: string;
  readonly locale: string;
  readonly timezone: string;
  readonly engineVersion: string;
  readonly adapterVersion: string;
  readonly effectivePolicyVersionId: StableIdentifierV1;
  readonly resultManifestId: StableIdentifierV1;
  readonly cacheIdentityHash: string;
  readonly createdAt: StrictUtcTimestampV1;
}

export interface DashboardSnapshotV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly snapshotId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly dashboardVersionId: StableIdentifierV1;
  readonly materializationIds: readonly StableIdentifierV1[];
  readonly inputSelectorHash: string;
  readonly permissionProjectionVersionId: StableIdentifierV1;
  readonly audience: DdaAudienceV1;
  readonly freshnessState: DdaFreshnessStateV1;
  readonly evidenceState: DdaEvidenceStateV1;
  readonly canonicalHash: string;
  readonly createdAt: StrictUtcTimestampV1;
}

export interface DdaFolderManifestV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly manifestId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly capabilityGrantId: StableIdentifierV1;
  readonly purpose: string;
  readonly supportedProfiles: readonly string[];
  readonly publicationProjectionId: StableIdentifierV1;
  readonly manifestHash: string;
  readonly version: number;
}

export interface DdaReceiptCandidateV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly candidateId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly profileVersionId: StableIdentifierV1;
  readonly fieldCandidates: Readonly<
    Record<string, { readonly value: string; readonly confidence: number }>
  >;
  readonly adapterVersion: string;
  readonly evidenceReferenceId: StableIdentifierV1;
  readonly candidateHash: string;
}

export interface DdaRefreshEventV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly eventId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: StableIdentifierV1;
  readonly snapshotId: StableIdentifierV1;
  readonly freshnessState: DdaFreshnessStateV1;
  readonly occurredAt: StrictUtcTimestampV1;
  readonly eventHash: string;
}

export type DdaErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TEXT'
  | 'INVALID_HASH'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_COLLECTION'
  | 'INVALID_VERSION'
  | 'UNSUPPORTED_TRANSFORM'
  | 'UNSUPPORTED_FRESHNESS'
  | 'UNSUPPORTED_WIDGET'
  | 'UNSUPPORTED_POLICY'
  | 'CROSS_SCOPE_REFERENCE'
  | 'INCOMPLETE_CACHE_IDENTITY'
  | 'ORIGINAL_MUTATION'
  | 'UNSUPPORTED_AGENT_LEVEL'
  | 'UNSUPPORTED_CONTEXT_KIND'
  | 'BOUNDS_EXCEEDED';

export type DdaResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DdaErrorCodeV1 };

const transformationKinds = new Set<DdaTransformationKindV1>([
  'SELECT_COLUMNS',
  'RENAME_COLUMNS',
  'TRIM_TEXT',
  'NORMALIZE_TEXT',
  'PARSE_DATE',
  'PARSE_TIME',
  'PARSE_NUMBER',
  'PARSE_CURRENCY',
  'CAST_TYPE',
  'REPLACE_NULL',
  'FILTER_ROWS',
  'DEDUPLICATE',
  'DERIVE_FIELD',
  'UNION_COMPATIBLE',
  'LOOKUP_JOIN',
  'AGGREGATE',
]);

const freshnessPolicies = new Set<DdaFreshnessPolicyV1>(['ON_CHANGE', 'MANUAL', 'SCHEDULED']);
const publicationPolicies = new Set<DdaPublicationPolicyV1>([
  'DRAFT_ONLY',
  'REVIEWED',
  'CERTIFIED',
]);
const widgetTypes = new Set<DdaWidgetTypeV1>([
  'KPI',
  'TABLE',
  'BAR',
  'LINE',
  'AREA',
  'PIE',
  'DONUT',
  'TEXT_NOTE',
  'EVIDENCE_NOTE',
]);
const freshnessStates = new Set<DdaFreshnessStateV1>([
  'FRESH',
  'STALE',
  'PENDING',
  'BLOCKED',
  'SOURCE_UNAVAILABLE',
]);
const evidenceStates = new Set<DdaEvidenceStateV1>(['AVAILABLE', 'PARTIAL', 'UNAVAILABLE']);
const audiences = new Set<DdaAudienceV1>([
  'OWNER',
  'WORKSPACE_VIEWERS',
  'PROJECT_VIEWERS',
  'SHARED_LINK',
]);
const timeGrains = new Set<DdaTimeGrainV1>(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']);
const outputForms = new Set<DdaOutputFormV1>(['TABLE', 'KPI', 'CHART', 'EVIDENCE']);
const classifications = new Set<DdaDataClassificationV1>([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
]);

function rejected(code: DdaErrorCodeV1): DdaResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function accepted<TValue>(value: TValue): DdaResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
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

function sameScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  if (left.scopeType !== right.scopeType) return false;
  if (left.organizationId !== right.organizationId) return false;
  if ('workspaceId' in left || 'workspaceId' in right) {
    if (!('workspaceId' in left) || !('workspaceId' in right)) return false;
    if (left.workspaceId !== right.workspaceId) return false;
  }
  if ('projectId' in left || 'projectId' in right) {
    if (!('projectId' in left) || !('projectId' in right)) return false;
    if (left.projectId !== right.projectId) return false;
  }
  return true;
}

function scopeKey(value: TenantScopeV1): string {
  const workspace = 'workspaceId' in value ? value.workspaceId : '';
  const project = 'projectId' in value ? value.projectId : '';
  return `${value.scopeType}|${value.organizationId}|${workspace}|${project}`;
}

function stableCanonicalHash(parts: Readonly<Record<string, unknown>>): string {
  const input = JSON.stringify(parts, Object.keys(parts).sort());
  let hashValue = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hashValue ^= input.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return (hashValue >>> 0).toString(16).padStart(8, '0').repeat(8);
}

function localized(input: unknown): LocalizedTextV1 | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const vi = text(record['vi'], 200);
  const en = text(record['en'], 200);
  if (!vi || !en) return undefined;
  return Object.freeze({ vi, en });
}

function configMap(
  input: unknown,
): Readonly<Record<string, string | number | boolean | null>> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const entries: [string, string | number | boolean | null][] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!text(key, 64)) return undefined;
    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      return undefined;
    }
    if (typeof value === 'string' && (value.length > 256 || /\p{Cc}/u.test(value))) {
      return undefined;
    }
    entries.push([key, value]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function transformationSteps(input: unknown): readonly DdaTransformationStepV1[] | DdaErrorCodeV1 {
  if (!Array.isArray(input) || input.length === 0 || input.length > 256)
    return 'INVALID_COLLECTION';
  const steps: DdaTransformationStepV1[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'INVALID_COLLECTION';
    const record = item as Record<string, unknown>;
    const stepId = identifier(record['stepId']);
    const kind = record['kind'];
    const inputs = record['inputs'];
    const config = configMap(record['config'] ?? {});
    if (!stepId) return 'INVALID_IDENTIFIER';
    if (typeof kind !== 'string' || !transformationKinds.has(kind as DdaTransformationKindV1)) {
      return 'UNSUPPORTED_TRANSFORM';
    }
    if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 32) {
      return 'INVALID_COLLECTION';
    }
    const parsedInputs: StableIdentifierV1[] = [];
    for (const value of inputs) {
      const id = identifier(value);
      if (!id) return 'INVALID_IDENTIFIER';
      parsedInputs.push(id);
    }
    if (!config) return 'INVALID_COLLECTION';
    if (seen.has(stepId)) return 'INVALID_COLLECTION';
    seen.add(stepId);
    steps.push(
      Object.freeze({
        stepId,
        kind: kind as DdaTransformationKindV1,
        inputs: Object.freeze(parsedInputs),
        config,
      }),
    );
  }
  return Object.freeze(steps);
}

function layoutCells(input: unknown): readonly DashboardLayoutCellV1[] | undefined {
  if (!Array.isArray(input) || input.length === 0 || input.length > 64) return undefined;
  const cells: DashboardLayoutCellV1[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
    const record = item as Record<string, unknown>;
    const widgetId = identifier(record['widgetId']);
    const x = record['x'];
    const y = record['y'];
    const w = record['w'];
    const h = record['h'];
    if (
      !widgetId ||
      ![x, y, w, h].every(
        (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
      ) ||
      (w as number) < 1 ||
      (h as number) < 1
    ) {
      return undefined;
    }
    cells.push(
      Object.freeze({ widgetId, x: x as number, y: y as number, w: w as number, h: h as number }),
    );
  }
  return Object.freeze(cells);
}

export function createDdaEtlPlanV1(input: {
  readonly planId: unknown;
  readonly planVersionId: unknown;
  readonly tenantScope: unknown;
  readonly inputArtifactVersionId: unknown;
  readonly schemaVersionId: unknown;
  readonly mappingVersionId: unknown;
  readonly ruleSetVersionId: unknown;
  readonly engineBindingId: unknown;
  readonly transformations: unknown;
  readonly contentHash: unknown;
  readonly schemaHash: unknown;
  readonly dataClassification: unknown;
  readonly dataModePolicyVersionId: unknown;
  readonly retentionReferenceId: unknown;
  readonly evidenceReferenceId: unknown;
  readonly createdAt: unknown;
  readonly inputTenantScope?: unknown;
}): DdaResultV1<DdaEtlPlanV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (input.inputTenantScope !== undefined) {
    const inputTenantScope = scope(input.inputTenantScope);
    if (!inputTenantScope) return rejected('INVALID_SCOPE');
    if (!sameScope(tenantScope, inputTenantScope)) return rejected('CROSS_SCOPE_REFERENCE');
  }
  const planId = identifier(input.planId);
  const planVersionId = identifier(input.planVersionId);
  const inputArtifactVersionId = identifier(input.inputArtifactVersionId);
  const schemaVersionId = identifier(input.schemaVersionId);
  const mappingVersionId = identifier(input.mappingVersionId);
  const ruleSetVersionId = identifier(input.ruleSetVersionId);
  const engineBindingId = identifier(input.engineBindingId);
  const dataModePolicyVersionId = identifier(input.dataModePolicyVersionId);
  const retentionReferenceId = identifier(input.retentionReferenceId);
  const evidenceReferenceId = identifier(input.evidenceReferenceId);
  const contentHash = hash(input.contentHash);
  const schemaHash = hash(input.schemaHash);
  const createdAt = timestamp(input.createdAt);
  const transformations = transformationSteps(input.transformations);
  if (
    !planId ||
    !planVersionId ||
    !inputArtifactVersionId ||
    !schemaVersionId ||
    !mappingVersionId ||
    !ruleSetVersionId ||
    !engineBindingId ||
    !dataModePolicyVersionId ||
    !retentionReferenceId ||
    !evidenceReferenceId
  ) {
    return rejected('INVALID_IDENTIFIER');
  }
  if (!contentHash || !schemaHash) return rejected('INVALID_HASH');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (typeof transformations === 'string') return rejected(transformations);
  if (!classifications.has(input.dataClassification as DdaDataClassificationV1)) {
    return rejected('UNSUPPORTED_POLICY');
  }
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      planId,
      planVersionId,
      tenantScope,
      inputArtifactVersionId,
      schemaVersionId,
      mappingVersionId,
      ruleSetVersionId,
      engineBindingId,
      transformations,
      contentHash,
      schemaHash,
      dataClassification: input.dataClassification as DdaDataClassificationV1,
      dataModePolicyVersionId,
      retentionReferenceId,
      evidenceReferenceId,
      createdAt,
    }),
  );
}

export function createDdaAnalysisPlanV1(input: {
  readonly planId: unknown;
  readonly planVersionId: unknown;
  readonly tenantScope: unknown;
  readonly datasetVersionId: unknown;
  readonly semanticVersionId: unknown;
  readonly metricVersionId: unknown;
  readonly dimensions: unknown;
  readonly filters: unknown;
  readonly timeRange: unknown;
  readonly timeGrain: unknown;
  readonly joins: unknown;
  readonly units: unknown;
  readonly parameters: unknown;
  readonly output: unknown;
  readonly assumptions: unknown;
  readonly estimate: unknown;
  readonly permissionProjectionVersionId: unknown;
  readonly planHash: unknown;
  readonly createdAt: unknown;
}): DdaResultV1<DdaAnalysisPlanV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const planId = identifier(input.planId);
  const planVersionId = identifier(input.planVersionId);
  const datasetVersionId = identifier(input.datasetVersionId);
  const semanticVersionId = identifier(input.semanticVersionId);
  const metricVersionId = identifier(input.metricVersionId);
  const permissionProjectionVersionId = identifier(input.permissionProjectionVersionId);
  const planHash = hash(input.planHash);
  const createdAt = timestamp(input.createdAt);
  if (
    !planId ||
    !planVersionId ||
    !datasetVersionId ||
    !semanticVersionId ||
    !metricVersionId ||
    !permissionProjectionVersionId
  ) {
    return rejected('INVALID_IDENTIFIER');
  }
  if (!planHash) return rejected('INVALID_HASH');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (!Array.isArray(input.dimensions) || input.dimensions.length > 32) {
    return rejected('INVALID_COLLECTION');
  }
  const dimensions = input.dimensions.map((value) => text(value, 96));
  if (dimensions.some((value) => !value)) return rejected('INVALID_TEXT');
  if (!input.timeRange || typeof input.timeRange !== 'object' || Array.isArray(input.timeRange)) {
    return rejected('INVALID_TIMESTAMP');
  }
  const range = input.timeRange as Record<string, unknown>;
  const start = timestamp(range['start']);
  const end = timestamp(range['end']);
  if (!start || !end || Date.parse(start) > Date.parse(end)) return rejected('INVALID_TIMESTAMP');
  if (!timeGrains.has(input.timeGrain as DdaTimeGrainV1)) return rejected('UNSUPPORTED_POLICY');
  if (!Array.isArray(input.filters) || input.filters.length > 64)
    return rejected('INVALID_COLLECTION');
  if (!Array.isArray(input.joins) || input.joins.length > 32) return rejected('INVALID_COLLECTION');
  if (!Array.isArray(input.assumptions) || input.assumptions.length > 32) {
    return rejected('INVALID_COLLECTION');
  }
  const assumptions = input.assumptions.map((value) => text(value, 500));
  if (assumptions.some((value) => !value)) return rejected('INVALID_TEXT');
  if (!input.output || typeof input.output !== 'object' || Array.isArray(input.output)) {
    return rejected('INVALID_COLLECTION');
  }
  const output = input.output as Record<string, unknown>;
  if (!outputForms.has(output['form'] as DdaOutputFormV1)) return rejected('UNSUPPORTED_POLICY');
  if (
    typeof output['maxRows'] !== 'number' ||
    !Number.isSafeInteger(output['maxRows']) ||
    output['maxRows'] < 1 ||
    output['maxRows'] > 10_000
  ) {
    return rejected('INVALID_COLLECTION');
  }
  if (!input.estimate || typeof input.estimate !== 'object' || Array.isArray(input.estimate)) {
    return rejected('INVALID_COLLECTION');
  }
  const estimate = input.estimate as Record<string, unknown>;
  if (
    typeof estimate['cpuMs'] !== 'number' ||
    typeof estimate['memoryMb'] !== 'number' ||
    !Number.isSafeInteger(estimate['cpuMs']) ||
    !Number.isSafeInteger(estimate['memoryMb']) ||
    estimate['cpuMs'] < 0 ||
    estimate['memoryMb'] < 0
  ) {
    return rejected('INVALID_COLLECTION');
  }
  if (!input.units || typeof input.units !== 'object' || Array.isArray(input.units)) {
    return rejected('INVALID_COLLECTION');
  }
  if (
    !input.parameters ||
    typeof input.parameters !== 'object' ||
    Array.isArray(input.parameters)
  ) {
    return rejected('INVALID_COLLECTION');
  }
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      planId,
      planVersionId,
      tenantScope,
      datasetVersionId,
      semanticVersionId,
      metricVersionId,
      dimensions: Object.freeze(dimensions as string[]),
      filters: Object.freeze(
        (input.filters as Record<string, string>[]).map((item) => Object.freeze({ ...item })),
      ),
      timeRange: Object.freeze({ start, end }),
      timeGrain: input.timeGrain as DdaTimeGrainV1,
      joins: Object.freeze(
        (input.joins as Record<string, string>[]).map((item) => Object.freeze({ ...item })),
      ),
      units: Object.freeze({ ...(input.units as Record<string, string>) }),
      parameters: Object.freeze({
        ...(input.parameters as Record<string, string | number | boolean>),
      }),
      output: Object.freeze({
        form: output['form'] as DdaOutputFormV1,
        maxRows: output['maxRows'],
      }),
      assumptions: Object.freeze(assumptions as string[]),
      estimate: Object.freeze({
        cpuMs: estimate['cpuMs'],
        memoryMb: estimate['memoryMb'],
      }),
      permissionProjectionVersionId,
      planHash,
      createdAt,
    }),
  );
}

export function createDashboardVersionV1(input: {
  readonly dashboardId: unknown;
  readonly versionId: unknown;
  readonly tenantScope: unknown;
  readonly parentVersionId?: unknown;
  readonly parentTenantScope?: unknown;
  readonly pages: unknown;
  readonly widgets: unknown;
  readonly filters: unknown;
  readonly datasetBindings: unknown;
  readonly locale: unknown;
  readonly timezone: unknown;
  readonly freshnessPolicy: unknown;
  readonly publicationPolicy: unknown;
  readonly canonicalHash: unknown;
  readonly createdAt: unknown;
}): DdaResultV1<DashboardVersionV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (input.parentTenantScope !== undefined) {
    const parentTenantScope = scope(input.parentTenantScope);
    if (!parentTenantScope) return rejected('INVALID_SCOPE');
    if (!sameScope(tenantScope, parentTenantScope)) return rejected('CROSS_SCOPE_REFERENCE');
  }
  const dashboardId = identifier(input.dashboardId);
  const versionId = identifier(input.versionId);
  const parentVersionId =
    input.parentVersionId === undefined ? undefined : identifier(input.parentVersionId);
  const canonicalHash = hash(input.canonicalHash);
  const createdAt = timestamp(input.createdAt);
  const locale = text(input.locale, 32);
  const timezone = text(input.timezone, 64);
  if (!dashboardId || !versionId) return rejected('INVALID_IDENTIFIER');
  if (input.parentVersionId !== undefined && !parentVersionId)
    return rejected('INVALID_IDENTIFIER');
  if (!canonicalHash) return rejected('INVALID_HASH');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (!locale || !timezone) return rejected('INVALID_TEXT');
  if (!freshnessPolicies.has(input.freshnessPolicy as DdaFreshnessPolicyV1)) {
    return rejected('UNSUPPORTED_FRESHNESS');
  }
  if (!publicationPolicies.has(input.publicationPolicy as DdaPublicationPolicyV1)) {
    return rejected('UNSUPPORTED_POLICY');
  }
  if (!Array.isArray(input.pages) || input.pages.length === 0 || input.pages.length > 32) {
    return rejected('INVALID_COLLECTION');
  }
  if (!Array.isArray(input.widgets) || input.widgets.length === 0 || input.widgets.length > 128) {
    return rejected('INVALID_COLLECTION');
  }
  if (!Array.isArray(input.filters) || input.filters.length > 64)
    return rejected('INVALID_COLLECTION');
  if (
    !Array.isArray(input.datasetBindings) ||
    input.datasetBindings.length === 0 ||
    input.datasetBindings.length > 32
  ) {
    return rejected('INVALID_COLLECTION');
  }

  const pages: DashboardPageV1[] = [];
  const pageIds = new Set<string>();
  for (const item of input.pages) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return rejected('INVALID_COLLECTION');
    const record = item as Record<string, unknown>;
    const pageId = identifier(record['pageId']);
    if (!pageId) return rejected('INVALID_IDENTIFIER');
    const title = localized(record['title']);
    if (!title) return rejected('INVALID_TEXT');
    if (
      !record['layout'] ||
      typeof record['layout'] !== 'object' ||
      Array.isArray(record['layout'])
    ) {
      return rejected('INVALID_COLLECTION');
    }
    const layout = record['layout'] as Record<string, unknown>;
    const desktop = layoutCells(layout['desktop']);
    const tablet = layoutCells(layout['tablet']);
    const mobile = layoutCells(layout['mobile']);
    if (!desktop || !tablet || !mobile) return rejected('INVALID_COLLECTION');
    if (
      typeof record['order'] !== 'number' ||
      !Number.isSafeInteger(record['order']) ||
      record['order'] < 1
    ) {
      return rejected('INVALID_COLLECTION');
    }
    if (pageIds.has(pageId)) return rejected('INVALID_COLLECTION');
    pageIds.add(pageId);
    pages.push(
      Object.freeze({
        pageId,
        order: record['order'],
        title,
        layout: Object.freeze({ desktop, tablet, mobile }),
      }),
    );
  }

  const widgets: DashboardWidgetV1[] = [];
  const widgetIds = new Set<string>();
  for (const item of input.widgets) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return rejected('INVALID_COLLECTION');
    const record = item as Record<string, unknown>;
    const widgetId = identifier(record['widgetId']);
    if (!widgetId) return rejected('INVALID_IDENTIFIER');
    if (!widgetTypes.has(record['type'] as DdaWidgetTypeV1)) return rejected('UNSUPPORTED_WIDGET');
    const pageId = identifier(record['pageId']);
    if (!pageId || !pageIds.has(pageId)) return rejected('INVALID_IDENTIFIER');
    const title = localized(record['title']);
    if (!title) return rejected('INVALID_TEXT');
    if (
      !record['binding'] ||
      typeof record['binding'] !== 'object' ||
      Array.isArray(record['binding'])
    ) {
      return rejected('INVALID_COLLECTION');
    }
    const binding = record['binding'] as Record<string, unknown>;
    const analysisPlanVersionId = identifier(binding['analysisPlanVersionId']);
    const materializationDefinitionId = identifier(binding['materializationDefinitionId']);
    if (!analysisPlanVersionId || !materializationDefinitionId) {
      return rejected('INVALID_IDENTIFIER');
    }
    if (widgetIds.has(widgetId)) return rejected('INVALID_COLLECTION');
    widgetIds.add(widgetId);
    widgets.push(
      Object.freeze({
        widgetId,
        type: record['type'] as DdaWidgetTypeV1,
        pageId,
        binding: Object.freeze({ analysisPlanVersionId, materializationDefinitionId }),
        title,
      }),
    );
  }

  const filters: DashboardFilterV1[] = [];
  for (const item of input.filters) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return rejected('INVALID_COLLECTION');
    const record = item as Record<string, unknown>;
    const filterId = identifier(record['filterId']);
    const field = text(record['field'], 96);
    const operator = text(record['operator'], 32);
    const filterScope = record['scope'];
    if (!filterId) return rejected('INVALID_IDENTIFIER');
    if (!field || !operator) return rejected('INVALID_TEXT');
    if (filterScope !== 'DASHBOARD' && filterScope !== 'PAGE' && filterScope !== 'WIDGET') {
      return rejected('UNSUPPORTED_POLICY');
    }
    filters.push(Object.freeze({ filterId, field, operator, scope: filterScope }));
  }

  const datasetBindings: DashboardDatasetBindingV1[] = [];
  for (const item of input.datasetBindings) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return rejected('INVALID_COLLECTION');
    const record = item as Record<string, unknown>;
    const datasetVersionId = identifier(record['datasetVersionId']);
    const semanticVersionId = identifier(record['semanticVersionId']);
    const metricVersionId = identifier(record['metricVersionId']);
    if (!datasetVersionId || !semanticVersionId || !metricVersionId) {
      return rejected('INVALID_IDENTIFIER');
    }
    datasetBindings.push(Object.freeze({ datasetVersionId, semanticVersionId, metricVersionId }));
  }

  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      dashboardId,
      versionId,
      tenantScope,
      ...(parentVersionId ? { parentVersionId } : {}),
      pages: Object.freeze(pages),
      widgets: Object.freeze(widgets),
      filters: Object.freeze(filters),
      datasetBindings: Object.freeze(datasetBindings),
      locale,
      timezone,
      freshnessPolicy: input.freshnessPolicy as DdaFreshnessPolicyV1,
      publicationPolicy: input.publicationPolicy as DdaPublicationPolicyV1,
      canonicalHash,
      createdAt,
    }),
  );
}

export function createDdaMaterializationV1(input: {
  readonly materializationId: unknown;
  readonly tenantScope: unknown;
  readonly dashboardVersionId: unknown;
  readonly widgetId: unknown;
  readonly analysisPlanVersionId: unknown;
  readonly datasetVersionId: unknown;
  readonly semanticVersionId: unknown;
  readonly metricVersionId: unknown;
  readonly permissionProjectionVersionId: unknown;
  readonly parameterHash: unknown;
  readonly locale: unknown;
  readonly timezone: unknown;
  readonly engineVersion: unknown;
  readonly adapterVersion: unknown;
  readonly effectivePolicyVersionId: unknown;
  readonly resultManifestId: unknown;
  readonly cacheIdentityHash: unknown;
  readonly createdAt: unknown;
}): DdaResultV1<DdaMaterializationV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const required = {
    materializationId: identifier(input.materializationId),
    dashboardVersionId: identifier(input.dashboardVersionId),
    widgetId: identifier(input.widgetId),
    analysisPlanVersionId: identifier(input.analysisPlanVersionId),
    datasetVersionId: identifier(input.datasetVersionId),
    semanticVersionId: identifier(input.semanticVersionId),
    metricVersionId: identifier(input.metricVersionId),
    permissionProjectionVersionId: identifier(input.permissionProjectionVersionId),
    effectivePolicyVersionId: identifier(input.effectivePolicyVersionId),
    resultManifestId: identifier(input.resultManifestId),
  };
  if (Object.values(required).some((value) => !value)) {
    if (
      input.permissionProjectionVersionId === undefined ||
      input.effectivePolicyVersionId === undefined ||
      input.parameterHash === undefined ||
      input.locale === undefined ||
      input.timezone === undefined ||
      input.engineVersion === undefined ||
      input.adapterVersion === undefined
    ) {
      return rejected('INCOMPLETE_CACHE_IDENTITY');
    }
    return rejected('INVALID_IDENTIFIER');
  }
  const parameterHash = hash(input.parameterHash);
  const cacheIdentityHash = hash(input.cacheIdentityHash);
  const locale = text(input.locale, 32);
  const timezone = text(input.timezone, 64);
  const engineVersion = text(input.engineVersion, 64);
  const adapterVersion = text(input.adapterVersion, 64);
  const createdAt = timestamp(input.createdAt);
  if (!parameterHash || !cacheIdentityHash) return rejected('INCOMPLETE_CACHE_IDENTITY');
  if (!locale || !timezone || !engineVersion || !adapterVersion) {
    return rejected('INCOMPLETE_CACHE_IDENTITY');
  }
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      materializationId: required.materializationId!,
      tenantScope,
      dashboardVersionId: required.dashboardVersionId!,
      widgetId: required.widgetId!,
      analysisPlanVersionId: required.analysisPlanVersionId!,
      datasetVersionId: required.datasetVersionId!,
      semanticVersionId: required.semanticVersionId!,
      metricVersionId: required.metricVersionId!,
      permissionProjectionVersionId: required.permissionProjectionVersionId!,
      parameterHash,
      locale,
      timezone,
      engineVersion,
      adapterVersion,
      effectivePolicyVersionId: required.effectivePolicyVersionId!,
      resultManifestId: required.resultManifestId!,
      cacheIdentityHash,
      createdAt,
    }),
  );
}

export function computeDashboardSnapshotHashV1(input: {
  readonly snapshotId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly dashboardVersionId: StableIdentifierV1;
  readonly materializationIds: readonly StableIdentifierV1[];
  readonly inputSelectorHash: string;
  readonly permissionProjectionVersionId: StableIdentifierV1;
  readonly audience: DdaAudienceV1;
  readonly freshnessState: DdaFreshnessStateV1;
  readonly evidenceState: DdaEvidenceStateV1;
  readonly createdAt: StrictUtcTimestampV1;
}): string {
  return stableCanonicalHash({
    snapshotId: input.snapshotId,
    tenantScope: scopeKey(input.tenantScope),
    dashboardVersionId: input.dashboardVersionId,
    materializationIds: [...input.materializationIds].sort(),
    inputSelectorHash: input.inputSelectorHash,
    permissionProjectionVersionId: input.permissionProjectionVersionId,
    audience: input.audience,
    freshnessState: input.freshnessState,
    evidenceState: input.evidenceState,
    createdAt: input.createdAt,
  });
}

export function createDashboardSnapshotV1(input: {
  readonly snapshotId: unknown;
  readonly tenantScope: unknown;
  readonly dashboardVersionId: unknown;
  readonly materializationIds: unknown;
  readonly inputSelectorHash: unknown;
  readonly permissionProjectionVersionId: unknown;
  readonly audience: unknown;
  readonly freshnessState: unknown;
  readonly evidenceState: unknown;
  readonly canonicalHash: unknown;
  readonly createdAt: unknown;
  readonly dashboardVersion?: DashboardVersionV1;
  readonly materializations?: readonly DdaMaterializationV1[];
}): DdaResultV1<DashboardSnapshotV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const snapshotId = identifier(input.snapshotId);
  const dashboardVersionId = identifier(input.dashboardVersionId);
  const permissionProjectionVersionId = identifier(input.permissionProjectionVersionId);
  const inputSelectorHash = hash(input.inputSelectorHash);
  const canonicalHash = hash(input.canonicalHash);
  const createdAt = timestamp(input.createdAt);
  if (!snapshotId || !dashboardVersionId || !permissionProjectionVersionId) {
    return rejected('INVALID_IDENTIFIER');
  }
  if (!inputSelectorHash || !canonicalHash) return rejected('INVALID_HASH');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (!audiences.has(input.audience as DdaAudienceV1)) return rejected('UNSUPPORTED_POLICY');
  if (!freshnessStates.has(input.freshnessState as DdaFreshnessStateV1)) {
    return rejected('UNSUPPORTED_POLICY');
  }
  if (!evidenceStates.has(input.evidenceState as DdaEvidenceStateV1)) {
    return rejected('UNSUPPORTED_POLICY');
  }
  if (
    !Array.isArray(input.materializationIds) ||
    input.materializationIds.length === 0 ||
    input.materializationIds.length > 256
  ) {
    return rejected('INVALID_COLLECTION');
  }
  const materializationIds: StableIdentifierV1[] = [];
  for (const value of input.materializationIds) {
    const id = identifier(value);
    if (!id) return rejected('INVALID_IDENTIFIER');
    materializationIds.push(id);
  }
  if (input.dashboardVersion && input.dashboardVersion.versionId !== dashboardVersionId) {
    return rejected('INVALID_IDENTIFIER');
  }
  if (input.dashboardVersion && !sameScope(tenantScope, input.dashboardVersion.tenantScope)) {
    return rejected('CROSS_SCOPE_REFERENCE');
  }
  if (input.materializations) {
    for (const materialization of input.materializations) {
      if (!sameScope(tenantScope, materialization.tenantScope)) {
        return rejected('CROSS_SCOPE_REFERENCE');
      }
      if (!materializationIds.includes(materialization.materializationId)) {
        return rejected('INVALID_COLLECTION');
      }
    }
  }
  const expectedHash = computeDashboardSnapshotHashV1({
    snapshotId,
    tenantScope,
    dashboardVersionId,
    materializationIds,
    inputSelectorHash,
    permissionProjectionVersionId,
    audience: input.audience as DdaAudienceV1,
    freshnessState: input.freshnessState as DdaFreshnessStateV1,
    evidenceState: input.evidenceState as DdaEvidenceStateV1,
    createdAt,
  });
  if (canonicalHash !== expectedHash) return rejected('INVALID_HASH');
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      snapshotId,
      tenantScope,
      dashboardVersionId,
      materializationIds: Object.freeze(materializationIds),
      inputSelectorHash,
      permissionProjectionVersionId,
      audience: input.audience as DdaAudienceV1,
      freshnessState: input.freshnessState as DdaFreshnessStateV1,
      evidenceState: input.evidenceState as DdaEvidenceStateV1,
      canonicalHash,
      createdAt,
    }),
  );
}

export function createDdaFolderManifestV1(input: {
  readonly manifestId: unknown;
  readonly tenantScope: unknown;
  readonly capabilityGrantId: unknown;
  readonly purpose: unknown;
  readonly supportedProfiles: unknown;
  readonly publicationProjectionId: unknown;
  readonly manifestHash: unknown;
  readonly version: unknown;
}): DdaResultV1<DdaFolderManifestV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const manifestId = identifier(input.manifestId);
  const capabilityGrantId = identifier(input.capabilityGrantId);
  const publicationProjectionId = identifier(input.publicationProjectionId);
  const purpose = text(input.purpose, 64);
  const manifestHash = hash(input.manifestHash);
  if (!manifestId || !capabilityGrantId || !publicationProjectionId) {
    return rejected('INVALID_IDENTIFIER');
  }
  if (!purpose) return rejected('INVALID_TEXT');
  if (!manifestHash) return rejected('INVALID_HASH');
  if (!Number.isSafeInteger(input.version) || (input.version as number) < 1) {
    return rejected('INVALID_VERSION');
  }
  if (
    !Array.isArray(input.supportedProfiles) ||
    input.supportedProfiles.length === 0 ||
    input.supportedProfiles.length > 16
  ) {
    return rejected('INVALID_COLLECTION');
  }
  const supportedProfiles = input.supportedProfiles.map((value) => text(value, 32));
  if (supportedProfiles.some((value) => !value)) return rejected('INVALID_TEXT');
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      manifestId,
      tenantScope,
      capabilityGrantId,
      purpose,
      supportedProfiles: Object.freeze(supportedProfiles as string[]),
      publicationProjectionId,
      manifestHash,
      version: input.version as number,
    }),
  );
}

export function createDdaReceiptCandidateV1(input: {
  readonly candidateId: unknown;
  readonly tenantScope: unknown;
  readonly artifactVersionId: unknown;
  readonly profileVersionId: unknown;
  readonly fieldCandidates: unknown;
  readonly adapterVersion: unknown;
  readonly evidenceReferenceId: unknown;
  readonly candidateHash: unknown;
}): DdaResultV1<DdaReceiptCandidateV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const candidateId = identifier(input.candidateId);
  const artifactVersionId = identifier(input.artifactVersionId);
  const profileVersionId = identifier(input.profileVersionId);
  const evidenceReferenceId = identifier(input.evidenceReferenceId);
  const adapterVersion = text(input.adapterVersion, 64);
  const candidateHash = hash(input.candidateHash);
  if (!candidateId || !artifactVersionId || !profileVersionId || !evidenceReferenceId) {
    return rejected('INVALID_IDENTIFIER');
  }
  if (!adapterVersion) return rejected('INVALID_TEXT');
  if (!candidateHash) return rejected('INVALID_HASH');
  if (
    !input.fieldCandidates ||
    typeof input.fieldCandidates !== 'object' ||
    Array.isArray(input.fieldCandidates)
  ) {
    return rejected('INVALID_COLLECTION');
  }
  const fieldCandidates: Record<string, { readonly value: string; readonly confidence: number }> =
    {};
  for (const [key, value] of Object.entries(input.fieldCandidates as Record<string, unknown>)) {
    const field = text(key, 64);
    if (!field || !value || typeof value !== 'object' || Array.isArray(value)) {
      return rejected('INVALID_COLLECTION');
    }
    const record = value as Record<string, unknown>;
    const fieldValue = text(record['value'], 500);
    const confidence = record['confidence'];
    if (
      !fieldValue ||
      typeof confidence !== 'number' ||
      confidence < 0 ||
      confidence > 1 ||
      Number.isNaN(confidence)
    ) {
      return rejected('INVALID_COLLECTION');
    }
    fieldCandidates[field] = Object.freeze({ value: fieldValue, confidence });
  }
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      candidateId,
      tenantScope,
      artifactVersionId,
      profileVersionId,
      fieldCandidates: Object.freeze(fieldCandidates),
      adapterVersion,
      evidenceReferenceId,
      candidateHash,
    }),
  );
}

export function createDdaRefreshEventV1(input: {
  readonly eventId: unknown;
  readonly tenantScope: unknown;
  readonly dashboardId: unknown;
  readonly snapshotId: unknown;
  readonly freshnessState: unknown;
  readonly occurredAt: unknown;
  readonly eventHash: unknown;
}): DdaResultV1<DdaRefreshEventV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const eventId = identifier(input.eventId);
  const dashboardId = identifier(input.dashboardId);
  const snapshotId = identifier(input.snapshotId);
  const occurredAt = timestamp(input.occurredAt);
  const eventHash = hash(input.eventHash);
  if (!eventId || !dashboardId || !snapshotId) return rejected('INVALID_IDENTIFIER');
  if (!occurredAt) return rejected('INVALID_TIMESTAMP');
  if (!eventHash) return rejected('INVALID_HASH');
  if (!freshnessStates.has(input.freshnessState as DdaFreshnessStateV1)) {
    return rejected('UNSUPPORTED_POLICY');
  }
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      eventId,
      tenantScope,
      dashboardId,
      snapshotId,
      freshnessState: input.freshnessState as DdaFreshnessStateV1,
      occurredAt,
      eventHash,
    }),
  );
}

export type DdaAgentGrantLevelV1 =
  | 'NONE'
  | 'ANALYZE'
  | 'PROPOSE_CHANGES'
  | 'APPLY_CONFIRMED_CHANGES';

export type DdaConversationContextKindV1 =
  | 'CONTEXT_RESTORED'
  | 'DATASET_VERSION_ADVANCED'
  | 'DATASET_ATTACHED'
  | 'DATASET_DETACHED'
  | 'DASHBOARD_VERSION_ADVANCED'
  | 'FILTER_CONTEXT_CHANGED';

export type DdaAutomaticPreparationPolicyV1 = 'SAFE_NON_LOSSY' | 'NONE';

const agentGrantLevels = new Set<DdaAgentGrantLevelV1>([
  'NONE',
  'ANALYZE',
  'PROPOSE_CHANGES',
  'APPLY_CONFIRMED_CHANGES',
]);

const conversationContextKinds = new Set<DdaConversationContextKindV1>([
  'CONTEXT_RESTORED',
  'DATASET_VERSION_ADVANCED',
  'DATASET_ATTACHED',
  'DATASET_DETACHED',
  'DASHBOARD_VERSION_ADVANCED',
  'FILTER_CONTEXT_CHANGED',
]);

export interface DdaAgentGrantV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly grantId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly memberId: StableIdentifierV1;
  readonly level: DdaAgentGrantLevelV1;
  readonly revision: number;
  readonly updatedAt: StrictUtcTimestampV1;
}

export interface DdaConversationContextEventV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly eventId: StableIdentifierV1;
  readonly conversationId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly kind: DdaConversationContextKindV1;
  readonly beforeVersionId?: StableIdentifierV1;
  readonly afterVersionId?: StableIdentifierV1;
  readonly occurredAt: StrictUtcTimestampV1;
}

export interface DdaSourceCatalogEntryV1 {
  readonly sourceId: StableIdentifierV1;
  readonly safeDisplayLabel: string;
  readonly sourceType: 'CSV' | 'XLSX' | 'IMAGE' | 'PDF' | 'RECEIPT' | 'TABLE';
  readonly versionId: StableIdentifierV1;
  readonly status: 'ACTIVE' | 'REVIEW' | 'QUARANTINED' | 'RETIRED';
  readonly health: 'HEALTHY' | 'WARNING' | 'BLOCKED' | 'UNKNOWN';
}

export interface DdaSourceCatalogV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly datasetId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly entries: readonly DdaSourceCatalogEntryV1[];
  readonly generatedAt: StrictUtcTimestampV1;
}

export interface DdaPreparationSummaryV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly summaryId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly automaticPolicy: DdaAutomaticPreparationPolicyV1;
  readonly counts: Readonly<{
    input: number;
    output: number;
    unchanged: number;
    changed: number;
    rejected: number;
    quarantined: number;
    unsupported: number;
  }>;
  readonly createdAt: StrictUtcTimestampV1;
}

export interface DdaConversationMessageV1 {
  readonly messageId: StableIdentifierV1;
  readonly role: 'USER' | 'AGENT' | 'SYSTEM';
  readonly text: string;
  readonly createdAt: StrictUtcTimestampV1;
}

export interface DdaConversationV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly conversationId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly title: string;
  readonly activeDatasetIds: readonly StableIdentifierV1[];
  readonly history: readonly DdaConversationMessageV1[];
  readonly updatedAt: StrictUtcTimestampV1;
}

export interface DdaTableExtractionCandidateV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly candidateId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly profileVersion: 'TABLE_V1';
  readonly pageCount: number;
  readonly columns: readonly string[];
  readonly cells: readonly Readonly<{
    row: number;
    column: number;
    text: string;
    confidence: number;
    evidence: Readonly<{ page: number; x: number; y: number; width: number; height: number }>;
  }>[];
  readonly evidenceReferenceId: StableIdentifierV1;
  readonly candidateHash: string;
}

export interface DdaStarterDashboardEventV1 {
  readonly schemaVersion: typeof DDA_SCHEMA_VERSION_V1;
  readonly eventId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly dashboardVersionId: StableIdentifierV1;
  readonly templateId: string;
  readonly aiUsed: false;
  readonly occurredAt: StrictUtcTimestampV1;
}

export function createDdaAgentGrantV1(input: {
  readonly grantId: unknown;
  readonly tenantScope: unknown;
  readonly memberId: unknown;
  readonly level: unknown;
  readonly revision: unknown;
  readonly updatedAt: unknown;
}): DdaResultV1<DdaAgentGrantV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const grantId = identifier(input.grantId);
  const memberId = identifier(input.memberId);
  const updatedAt = timestamp(input.updatedAt);
  if (!grantId || !memberId) return rejected('INVALID_IDENTIFIER');
  if (!updatedAt) return rejected('INVALID_TIMESTAMP');
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1) {
    return rejected('INVALID_VERSION');
  }
  if (!agentGrantLevels.has(input.level as DdaAgentGrantLevelV1)) {
    return rejected('UNSUPPORTED_AGENT_LEVEL');
  }
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      grantId,
      tenantScope,
      memberId,
      level: input.level as DdaAgentGrantLevelV1,
      revision: input.revision as number,
      updatedAt,
    }),
  );
}

export function createDdaConversationContextEventV1(input: {
  readonly eventId: unknown;
  readonly conversationId: unknown;
  readonly tenantScope: unknown;
  readonly kind: unknown;
  readonly beforeVersionId?: unknown;
  readonly afterVersionId?: unknown;
  readonly occurredAt: unknown;
}): DdaResultV1<DdaConversationContextEventV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const eventId = identifier(input.eventId);
  const conversationId = identifier(input.conversationId);
  const occurredAt = timestamp(input.occurredAt);
  if (!eventId || !conversationId) return rejected('INVALID_IDENTIFIER');
  if (!occurredAt) return rejected('INVALID_TIMESTAMP');
  if (!conversationContextKinds.has(input.kind as DdaConversationContextKindV1)) {
    return rejected('UNSUPPORTED_CONTEXT_KIND');
  }
  const beforeVersionId =
    input.beforeVersionId === undefined ? undefined : identifier(input.beforeVersionId);
  const afterVersionId =
    input.afterVersionId === undefined ? undefined : identifier(input.afterVersionId);
  if (input.beforeVersionId !== undefined && !beforeVersionId)
    return rejected('INVALID_IDENTIFIER');
  if (input.afterVersionId !== undefined && !afterVersionId) return rejected('INVALID_IDENTIFIER');
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      eventId,
      conversationId,
      tenantScope,
      kind: input.kind as DdaConversationContextKindV1,
      ...(beforeVersionId ? { beforeVersionId } : {}),
      ...(afterVersionId ? { afterVersionId } : {}),
      occurredAt,
    }),
  );
}

export function createDdaConversationV1(input: {
  readonly conversationId: unknown;
  readonly tenantScope: unknown;
  readonly title: unknown;
  readonly activeDatasetIds: unknown;
  readonly history: unknown;
  readonly updatedAt: unknown;
}): DdaResultV1<DdaConversationV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const conversationId = identifier(input.conversationId);
  const title = text(input.title, 200);
  const updatedAt = timestamp(input.updatedAt);
  if (!conversationId) return rejected('INVALID_IDENTIFIER');
  if (!title) return rejected('INVALID_TEXT');
  if (!updatedAt) return rejected('INVALID_TIMESTAMP');
  if (!Array.isArray(input.activeDatasetIds) || input.activeDatasetIds.length > 8) {
    return rejected('BOUNDS_EXCEEDED');
  }
  const activeDatasetIds = input.activeDatasetIds.map((value) => identifier(value));
  if (activeDatasetIds.some((value) => !value)) return rejected('INVALID_IDENTIFIER');
  if (!Array.isArray(input.history) || input.history.length > 50) {
    return rejected('BOUNDS_EXCEEDED');
  }
  const history: DdaConversationMessageV1[] = [];
  for (const raw of input.history) {
    if (!raw || typeof raw !== 'object') return rejected('INVALID_COLLECTION');
    const message = raw as Record<string, unknown>;
    const messageId = identifier(message['messageId']);
    const createdAt = timestamp(message['createdAt']);
    const messageText = text(message['text'], 16000);
    if (!messageId || !createdAt || !messageText) return rejected('INVALID_TEXT');
    if (!['USER', 'AGENT', 'SYSTEM'].includes(message['role'] as string)) {
      return rejected('UNSUPPORTED_POLICY');
    }
    history.push(
      Object.freeze({
        messageId,
        role: message['role'] as 'USER' | 'AGENT' | 'SYSTEM',
        text: messageText,
        createdAt,
      }),
    );
  }
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      conversationId,
      tenantScope,
      title,
      activeDatasetIds: Object.freeze(activeDatasetIds as StableIdentifierV1[]),
      history: Object.freeze(history),
      updatedAt,
    }),
  );
}

export function createDdaTableExtractionCandidateV1(input: {
  readonly candidateId: unknown;
  readonly tenantScope: unknown;
  readonly artifactVersionId: unknown;
  readonly pageCount: unknown;
  readonly columns: unknown;
  readonly cells: unknown;
  readonly evidenceReferenceId: unknown;
  readonly candidateHash: unknown;
}): DdaResultV1<DdaTableExtractionCandidateV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const candidateId = identifier(input.candidateId);
  const artifactVersionId = identifier(input.artifactVersionId);
  const evidenceReferenceId = identifier(input.evidenceReferenceId);
  const candidateHash = hash(input.candidateHash);
  if (!candidateId || !artifactVersionId || !evidenceReferenceId) {
    return rejected('INVALID_IDENTIFIER');
  }
  if (!candidateHash) return rejected('INVALID_HASH');
  if (
    !Number.isSafeInteger(input.pageCount) ||
    (input.pageCount as number) < 1 ||
    (input.pageCount as number) > 20
  ) {
    return rejected('BOUNDS_EXCEEDED');
  }
  if (!Array.isArray(input.columns) || input.columns.length < 1 || input.columns.length > 100) {
    return rejected('BOUNDS_EXCEEDED');
  }
  if (!Array.isArray(input.cells) || input.cells.length > 10000) {
    return rejected('BOUNDS_EXCEEDED');
  }
  for (const cell of input.cells) {
    if (!cell || typeof cell !== 'object') return rejected('INVALID_COLLECTION');
    const evidence = (cell as { evidence?: unknown }).evidence;
    if (!evidence || typeof evidence !== 'object') return rejected('INVALID_COLLECTION');
  }
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      candidateId,
      tenantScope,
      artifactVersionId,
      profileVersion: 'TABLE_V1',
      pageCount: input.pageCount as number,
      columns: Object.freeze([...(input.columns as string[])]),
      cells: Object.freeze([...(input.cells as DdaTableExtractionCandidateV1['cells'])]),
      evidenceReferenceId,
      candidateHash,
    }),
  );
}

export function createDdaStarterDashboardEventV1(input: {
  readonly eventId: unknown;
  readonly tenantScope: unknown;
  readonly datasetVersionId: unknown;
  readonly dashboardVersionId: unknown;
  readonly templateId: unknown;
  readonly aiUsed: unknown;
  readonly occurredAt: unknown;
}): DdaResultV1<DdaStarterDashboardEventV1> {
  const tenantScope = scope(input.tenantScope);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const eventId = identifier(input.eventId);
  const datasetVersionId = identifier(input.datasetVersionId);
  const dashboardVersionId = identifier(input.dashboardVersionId);
  const templateId = text(input.templateId, 64);
  const occurredAt = timestamp(input.occurredAt);
  if (!eventId || !datasetVersionId || !dashboardVersionId) return rejected('INVALID_IDENTIFIER');
  if (!templateId) return rejected('INVALID_TEXT');
  if (!occurredAt) return rejected('INVALID_TIMESTAMP');
  if (input.aiUsed !== false) return rejected('UNSUPPORTED_POLICY');
  return accepted(
    Object.freeze({
      schemaVersion: DDA_SCHEMA_VERSION_V1,
      eventId,
      tenantScope,
      datasetVersionId,
      dashboardVersionId,
      templateId,
      aiUsed: false,
      occurredAt,
    }),
  );
}
