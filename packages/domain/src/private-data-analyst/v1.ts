import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** PDA-007..PDA-018: typed, deterministic analysis plans with provenance. */
export const PRIVATE_DATA_ANALYST_SCHEMA_VERSION_V1 = 1 as const;
export type PrivateAnalysisMetricOperationV1 = 'SUM' | 'COUNT' | 'AVERAGE';
export interface PrivateAnalysisPlanV1 {
  readonly schemaVersion: typeof PRIVATE_DATA_ANALYST_SCHEMA_VERSION_V1;
  readonly planId: StableIdentifierV1;
  readonly planVersion: number;
  readonly tenantScope: TenantScopeV1;
  readonly question: string;
  readonly datasetVersionId: StableIdentifierV1;
  readonly semanticVersionId: StableIdentifierV1;
  readonly dimensions: readonly string[];
  readonly metric: { readonly field: string; readonly operation: PrivateAnalysisMetricOperationV1 };
  readonly outputLimit: number;
  readonly planHash: string;
}
export interface PrivateAnalysisResultV1 {
  readonly schemaVersion: typeof PRIVATE_DATA_ANALYST_SCHEMA_VERSION_V1;
  readonly status: 'READY' | 'INSUFFICIENT_DATA';
  readonly planId: StableIdentifierV1;
  readonly planVersion: number;
  readonly rows: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly provenance: {
    readonly datasetVersionId: StableIdentifierV1;
    readonly semanticVersionId: StableIdentifierV1;
    readonly planHash: string;
    readonly engineVersion: string;
  };
  readonly resultHash: string;
  readonly egressState: 'LOCAL_ONLY' | 'APPROVED_DERIVED_RESULT';
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
function hash(value: unknown): string {
  const input = JSON.stringify(value);
  let hashValue = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hashValue ^= input.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return (hashValue >>> 0).toString(16).padStart(8, '0').repeat(8);
}
export function createPrivateAnalysisPlanV1(input: {
  readonly planId: unknown;
  readonly planVersion: unknown;
  readonly tenantScope: unknown;
  readonly question: unknown;
  readonly datasetVersionId: unknown;
  readonly semanticVersionId: unknown;
  readonly dimensions: unknown;
  readonly metric: unknown;
  readonly outputLimit: unknown;
}):
  | { readonly accepted: true; readonly value: PrivateAnalysisPlanV1 }
  | { readonly accepted: false; readonly code: string } {
  const planId = id(input.planId);
  const tenantScope = scope(input.tenantScope);
  const question = text(input.question, 2_000);
  const datasetVersionId = id(input.datasetVersionId);
  const semanticVersionId = id(input.semanticVersionId);
  const dimensions = input.dimensions;
  const metric = input.metric;
  if (
    !planId ||
    !tenantScope ||
    !question ||
    !datasetVersionId ||
    !semanticVersionId ||
    !Number.isSafeInteger(input.planVersion) ||
    (input.planVersion as number) < 1 ||
    !Array.isArray(dimensions) ||
    dimensions.length > 32 ||
    dimensions.some((dimension) => !text(dimension, 96)) ||
    !metric ||
    typeof metric !== 'object' ||
    Array.isArray(metric) ||
    !Number.isSafeInteger(input.outputLimit) ||
    (input.outputLimit as number) < 1 ||
    (input.outputLimit as number) > 10_000
  )
    return Object.freeze({ accepted: false, code: 'INVALID_PLAN' });
  const record = metric as Record<string, unknown>;
  const field = text(record['field'], 96);
  const operation = record['operation'];
  if (!field || !['SUM', 'COUNT', 'AVERAGE'].includes(String(operation)))
    return Object.freeze({ accepted: false, code: 'INVALID_METRIC' });
  const value = Object.freeze({
    schemaVersion: PRIVATE_DATA_ANALYST_SCHEMA_VERSION_V1,
    planId,
    planVersion: input.planVersion as number,
    tenantScope,
    question,
    datasetVersionId,
    semanticVersionId,
    dimensions: Object.freeze((dimensions as string[]).map((dimension) => dimension.trim())),
    metric: Object.freeze({ field, operation: operation as PrivateAnalysisMetricOperationV1 }),
    outputLimit: input.outputLimit as number,
    planHash: hash({
      planId,
      planVersion: input.planVersion,
      tenantScope,
      question,
      datasetVersionId,
      semanticVersionId,
      dimensions,
      metric,
      outputLimit: input.outputLimit,
    }),
  });
  return Object.freeze({ accepted: true, value });
}
export function executePrivateAnalysisPlanV1(
  plan: PrivateAnalysisPlanV1,
  rows: readonly Readonly<Record<string, unknown>>[],
): PrivateAnalysisResultV1 {
  const groups = new Map<
    string,
    {
      readonly dimensions: Record<string, string | number | boolean | null>;
      total: number;
      count: number;
    }
  >();
  for (const row of rows) {
    const dimensions = Object.fromEntries(
      plan.dimensions.map((dimension) => [
        dimension,
        (row[dimension] ?? null) as string | number | boolean | null,
      ]),
    );
    const key = JSON.stringify(plan.dimensions.map((dimension) => dimensions[dimension]));
    const existing = groups.get(key) ?? { dimensions, total: 0, count: 0 };
    const raw = row[plan.metric.field];
    if (plan.metric.operation !== 'COUNT' && (typeof raw !== 'number' || !Number.isFinite(raw)))
      continue;
    existing.total += plan.metric.operation === 'COUNT' ? 1 : (raw as number);
    existing.count += 1;
    groups.set(key, existing);
  }
  const output = [...groups.values()]
    .map((group) => ({
      ...group.dimensions,
      value:
        plan.metric.operation === 'AVERAGE'
          ? Number((group.total / group.count).toFixed(6))
          : Number(group.total.toFixed(6)),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    .slice(0, plan.outputLimit);
  if (output.length === 0)
    return Object.freeze({
      schemaVersion: PRIVATE_DATA_ANALYST_SCHEMA_VERSION_V1,
      status: 'INSUFFICIENT_DATA',
      planId: plan.planId,
      planVersion: plan.planVersion,
      rows: Object.freeze([]),
      provenance: Object.freeze({
        datasetVersionId: plan.datasetVersionId,
        semanticVersionId: plan.semanticVersionId,
        planHash: plan.planHash,
        engineVersion: 'pda-deterministic-v1',
      }),
      resultHash: hash({ plan, output }),
      egressState: 'LOCAL_ONLY',
    });
  return Object.freeze({
    schemaVersion: PRIVATE_DATA_ANALYST_SCHEMA_VERSION_V1,
    status: 'READY',
    planId: plan.planId,
    planVersion: plan.planVersion,
    rows: Object.freeze(output),
    provenance: Object.freeze({
      datasetVersionId: plan.datasetVersionId,
      semanticVersionId: plan.semanticVersionId,
      planHash: plan.planHash,
      engineVersion: 'pda-deterministic-v1',
    }),
    resultHash: hash({ plan, output }),
    egressState: 'LOCAL_ONLY',
  });
}
