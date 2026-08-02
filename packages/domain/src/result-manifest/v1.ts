import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** JRA-012 and JRA-029: immutable execution result manifests. */
export const RESULT_MANIFEST_SCHEMA_VERSION_V1 = 1 as const;

export type ResultEvidenceCoverageV1 = 'COMPLETE' | 'PARTIAL' | 'NONE';
export type ResultApprovalStateV1 = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ResultManifestV1 {
  readonly schemaVersion: typeof RESULT_MANIFEST_SCHEMA_VERSION_V1;
  readonly resultManifestId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly sourceArtifactVersionIds: readonly StableIdentifierV1[];
  readonly outputIds: readonly StableIdentifierV1[];
  readonly outputHashes: readonly string[];
  readonly evidenceCoverage: ResultEvidenceCoverageV1;
  readonly handlerDigest: string;
  readonly engineVersion: string;
  readonly attemptNumber: number;
  readonly reviewerId?: StableIdentifierV1;
  readonly approvalState: ResultApprovalStateV1;
  readonly manifestHash: string;
  readonly generatedAt: StrictUtcTimestampV1;
}

export type ResultManifestResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ResultManifestErrorCodeV1 };

export type ResultManifestErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_HASH'
  | 'INVALID_LIST'
  | 'INVALID_TEXT'
  | 'INVALID_NUMBER'
  | 'INVALID_COVERAGE'
  | 'INVALID_APPROVAL_STATE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_REVIEWER';

function rejected<TValue>(code: ResultManifestErrorCodeV1): ResultManifestResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
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
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input) ? input : undefined;
}

function text(input: unknown, maximum: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maximum) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined;
}

function identifierList(input: unknown): readonly StableIdentifierV1[] | undefined {
  if (!Array.isArray(input) || input.length > 10_000) return undefined;
  const values = input.map(stable);
  if (values.some((value) => value === undefined)) return undefined;
  return Object.freeze([...new Set(values as StableIdentifierV1[])]);
}

function hashList(input: unknown): readonly string[] | undefined {
  if (!Array.isArray(input) || input.length > 10_000) return undefined;
  const values = input.map(hash);
  if (values.some((value) => value === undefined)) return undefined;
  return Object.freeze([...values] as string[]);
}

export function createResultManifestV1(input: {
  readonly resultManifestId: unknown;
  readonly jobId: unknown;
  readonly attemptId: unknown;
  readonly tenantScope: unknown;
  readonly sourceArtifactVersionIds: unknown;
  readonly outputIds: unknown;
  readonly outputHashes: unknown;
  readonly evidenceCoverage: unknown;
  readonly handlerDigest: unknown;
  readonly engineVersion: unknown;
  readonly attemptNumber: unknown;
  readonly reviewerId?: unknown;
  readonly approvalState: unknown;
  readonly manifestHash: unknown;
  readonly generatedAt: unknown;
}): ResultManifestResultV1<ResultManifestV1> {
  const resultManifestId = stable(input.resultManifestId);
  const jobId = stable(input.jobId);
  const attemptId = stable(input.attemptId);
  const tenantScope = scope(input.tenantScope);
  const sourceArtifactVersionIds = identifierList(input.sourceArtifactVersionIds);
  const outputIds = identifierList(input.outputIds);
  const outputHashes = hashList(input.outputHashes);
  const handlerDigest = hash(input.handlerDigest);
  const engineVersion = text(input.engineVersion, 128);
  const manifestHash = hash(input.manifestHash);
  const generatedAt = timestamp(input.generatedAt);
  if (!resultManifestId || !jobId || !attemptId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!sourceArtifactVersionIds || !outputIds || !outputHashes) return rejected('INVALID_LIST');
  if (!handlerDigest || !manifestHash) return rejected('INVALID_HASH');
  if (!engineVersion) return rejected('INVALID_TEXT');
  if (!generatedAt) return rejected('INVALID_TIMESTAMP');
  if (
    typeof input.attemptNumber !== 'number' ||
    !Number.isSafeInteger(input.attemptNumber) ||
    input.attemptNumber < 1 ||
    input.attemptNumber > 20
  )
    return rejected('INVALID_NUMBER');
  if (
    input.evidenceCoverage !== 'COMPLETE' &&
    input.evidenceCoverage !== 'PARTIAL' &&
    input.evidenceCoverage !== 'NONE'
  )
    return rejected('INVALID_COVERAGE');
  if (
    input.approvalState !== 'NOT_REQUIRED' &&
    input.approvalState !== 'PENDING' &&
    input.approvalState !== 'APPROVED' &&
    input.approvalState !== 'REJECTED'
  )
    return rejected('INVALID_APPROVAL_STATE');
  const reviewerId = input.reviewerId === undefined ? undefined : stable(input.reviewerId);
  if (input.reviewerId !== undefined && !reviewerId) return rejected('INVALID_REVIEWER');
  if (input.approvalState === 'APPROVED' && !reviewerId) return rejected('INVALID_REVIEWER');
  if (outputIds.length !== outputHashes.length) return rejected('INVALID_LIST');
  if (input.approvalState === 'NOT_REQUIRED' && reviewerId) return rejected('INVALID_REVIEWER');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: RESULT_MANIFEST_SCHEMA_VERSION_V1,
      resultManifestId,
      jobId,
      attemptId,
      tenantScope,
      sourceArtifactVersionIds,
      outputIds,
      outputHashes,
      evidenceCoverage: input.evidenceCoverage as ResultEvidenceCoverageV1,
      handlerDigest,
      engineVersion,
      attemptNumber: input.attemptNumber,
      ...(reviewerId ? { reviewerId } : {}),
      approvalState: input.approvalState as ResultApprovalStateV1,
      manifestHash,
      generatedAt,
    }),
  });
}
