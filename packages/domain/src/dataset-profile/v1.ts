import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** DSM-011: bounded, reproducible profiling disclosure without source values. */
export const DATASET_PROFILE_SCHEMA_VERSION_V1 = 1 as const;

export type DatasetProfileCompletenessV1 = 'COMPLETE' | 'DETERMINISTIC_SAMPLE';

export interface DatasetProfileResourceLimitsV1 {
  readonly maxRows: number;
  readonly maxBytes: number;
  readonly maxDurationMs: number;
}

export interface DatasetProfileV1 {
  readonly schemaVersion: typeof DATASET_PROFILE_SCHEMA_VERSION_V1;
  readonly profileId: StableIdentifierV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly completeness: DatasetProfileCompletenessV1;
  readonly samplingMethod: string;
  readonly samplingSeed?: string;
  readonly excludedScopes: readonly string[];
  readonly rowCountScanned: number;
  readonly rowCountAvailable?: number;
  readonly resourceLimits: DatasetProfileResourceLimitsV1;
  readonly profileFingerprint: string;
  readonly createdAt: StrictUtcTimestampV1;
}

export type DatasetProfileErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TEXT'
  | 'INVALID_HASH'
  | 'INVALID_COUNT'
  | 'INVALID_COMPLETENESS'
  | 'INVALID_SAMPLING'
  | 'INVALID_LIMITS';

export type DatasetProfileResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DatasetProfileErrorCodeV1 };

function accepted<TValue>(value: TValue): DatasetProfileResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: DatasetProfileErrorCodeV1): DatasetProfileResultV1<never> {
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

function count(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? input : undefined;
}

function limit(input: unknown, maximum: number): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input > 0 && input <= maximum
    ? input
    : undefined;
}

export function createDatasetProfileV1(input: {
  readonly profileId: unknown;
  readonly datasetVersionId: unknown;
  readonly tenantScope: unknown;
  readonly completeness: unknown;
  readonly samplingMethod: unknown;
  readonly samplingSeed?: unknown;
  readonly excludedScopes?: unknown;
  readonly rowCountScanned: unknown;
  readonly rowCountAvailable?: unknown;
  readonly resourceLimits: unknown;
  readonly profileFingerprint: unknown;
  readonly createdAt: unknown;
}): DatasetProfileResultV1<DatasetProfileV1> {
  const profileId = identifier(input.profileId);
  const datasetVersionId = identifier(input.datasetVersionId);
  const tenantScope = scope(input.tenantScope);
  const completeness = input.completeness;
  const samplingMethod = text(input.samplingMethod, 96);
  const samplingSeed = input.samplingSeed === undefined ? undefined : hash(input.samplingSeed);
  const excludedInput = input.excludedScopes ?? [];
  const excludedScopes = Array.isArray(excludedInput)
    ? excludedInput.map((value) => text(value, 128))
    : undefined;
  const rowCountScanned = count(input.rowCountScanned);
  const rowCountAvailable =
    input.rowCountAvailable === undefined ? undefined : count(input.rowCountAvailable);
  const limits = input.resourceLimits;
  const profileFingerprint = hash(input.profileFingerprint);
  const createdAt = timestamp(input.createdAt);

  if (!profileId || !datasetVersionId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!['COMPLETE', 'DETERMINISTIC_SAMPLE'].includes(completeness as string))
    return rejected('INVALID_COMPLETENESS');
  if (!samplingMethod) return rejected('INVALID_SAMPLING');
  if (completeness === 'DETERMINISTIC_SAMPLE' && !samplingSeed) return rejected('INVALID_SAMPLING');
  if (completeness === 'COMPLETE' && input.samplingSeed !== undefined)
    return rejected('INVALID_SAMPLING');
  if (
    !excludedScopes ||
    excludedScopes.length > 64 ||
    excludedScopes.some((value): value is undefined => value === undefined)
  )
    return rejected('INVALID_TEXT');
  if (new Set(excludedScopes).size !== excludedScopes.length) return rejected('INVALID_TEXT');
  if (rowCountScanned === undefined) return rejected('INVALID_COUNT');
  if (rowCountAvailable !== undefined && rowCountScanned > rowCountAvailable)
    return rejected('INVALID_COUNT');
  if (typeof limits !== 'object' || limits === null || Array.isArray(limits))
    return rejected('INVALID_LIMITS');
  const limitRecord = limits as Record<string, unknown>;
  const maxRows = limit(limitRecord['maxRows'], 10_000_000);
  const maxBytes = limit(limitRecord['maxBytes'], 1024 * 1024 * 1024 * 1024);
  const maxDurationMs = limit(limitRecord['maxDurationMs'], 86_400_000);
  if (!maxRows || !maxBytes || !maxDurationMs) return rejected('INVALID_LIMITS');
  if (rowCountScanned > maxRows) return rejected('INVALID_COUNT');
  if (!profileFingerprint) return rejected('INVALID_HASH');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  return accepted(
    Object.freeze({
      schemaVersion: DATASET_PROFILE_SCHEMA_VERSION_V1,
      profileId,
      datasetVersionId,
      tenantScope,
      completeness: completeness as DatasetProfileCompletenessV1,
      samplingMethod,
      ...(samplingSeed === undefined ? {} : { samplingSeed }),
      excludedScopes: Object.freeze(excludedScopes as string[]),
      rowCountScanned,
      ...(rowCountAvailable === undefined ? {} : { rowCountAvailable }),
      resourceLimits: Object.freeze({ maxRows, maxBytes, maxDurationMs }),
      profileFingerprint,
      createdAt,
    }),
  );
}
