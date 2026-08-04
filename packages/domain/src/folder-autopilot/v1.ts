import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';
import type { DataModeV1 } from '../data-mode/v1.js';

/** FA-001..FA-007, FA-014, FA-015 and FA-031: content-free automation records. */
export const FOLDER_AUTOPILOT_SCHEMA_VERSION_V1 = 1 as const;

export type AutopilotFolderBindingRoleV1 = 'INPUT' | 'OUTPUT';
export type FolderAutopilotCollisionPolicyV1 = 'REVIEW' | 'SKIP' | 'UNIQUE_NAME';
export type RecipeAssignmentStateV1 = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'RETIRED';

export interface FolderAutopilotProfileV1 {
  readonly schemaVersion: typeof FOLDER_AUTOPILOT_SCHEMA_VERSION_V1;
  readonly profileId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly version: number;
  /** SHA-256 of the canonical typed profile payload. */
  readonly payloadHash: string;
  readonly stabilizationDelayMs: number;
  readonly maxFilesPerScan: number;
  readonly collisionPolicy: FolderAutopilotCollisionPolicyV1;
  readonly undoWindowSeconds: number;
  readonly outputLineageEnabled: boolean;
  readonly createdAt: StrictUtcTimestampV1;
  readonly revision: 1;
}

/** A binding is deliberately only an opaque DSO reference plus a digest. */
export interface AutopilotFolderBindingV1 {
  readonly schemaVersion: typeof FOLDER_AUTOPILOT_SCHEMA_VERSION_V1;
  readonly bindingId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly deviceGrantId: StableIdentifierV1;
  readonly role: AutopilotFolderBindingRoleV1;
  readonly expectedCapabilityDigest: string;
  readonly createdAt: StrictUtcTimestampV1;
  readonly revision: 1;
}

/**
 * Assignment state is a feature projection. JRA remains authoritative for the
 * recipe/version and DSO remains authoritative for grant status and revocation.
 */
export interface RecipeAssignmentV1 {
  readonly schemaVersion: typeof FOLDER_AUTOPILOT_SCHEMA_VERSION_V1;
  readonly assignmentId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly profileId: StableIdentifierV1;
  readonly profileVersion: number;
  readonly profileHash: string;
  readonly jraRecipeVersionId: StableIdentifierV1;
  readonly jraRecipeVersionHash: string;
  readonly deviceId: StableIdentifierV1;
  readonly inputBindingIds: readonly StableIdentifierV1[];
  readonly outputBindingIds: readonly StableIdentifierV1[];
  readonly dataModeConstraint?: DataModeV1;
  readonly effectiveDataModePolicyRef?: StableIdentifierV1;
  readonly idempotencyKey: string;
  readonly state: RecipeAssignmentStateV1;
  readonly revision: number;
  readonly createdAt: StrictUtcTimestampV1;
}

export type FolderAutopilotErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_HASH'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_VERSION'
  | 'INVALID_REVISION'
  | 'INVALID_ROLE'
  | 'INVALID_COLLISION_POLICY'
  | 'INVALID_SETTINGS'
  | 'INVALID_BINDINGS'
  | 'INVALID_DATA_MODE'
  | 'INVALID_POLICY_REFERENCE'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'INVALID_STATE';

export type FolderAutopilotResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: FolderAutopilotErrorCodeV1 };

function rejected<TValue>(code: FolderAutopilotErrorCodeV1): FolderAutopilotResultV1<TValue> {
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

function boundedInteger(input: unknown, minimum: number, maximum: number): number | undefined {
  return typeof input === 'number' &&
    Number.isSafeInteger(input) &&
    input >= minimum &&
    input <= maximum
    ? input
    : undefined;
}

function text(input: unknown, maximum: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maximum) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined;
}

function identifiers(input: unknown): readonly StableIdentifierV1[] | undefined {
  if (!Array.isArray(input) || input.length < 1 || input.length > 32) return undefined;
  const values = Array.from(input, stable);
  if (values.some((value) => value === undefined)) return undefined;
  const result = values as StableIdentifierV1[];
  if (new Set(result).size !== result.length) return undefined;
  return Object.freeze([...result]);
}

function dataMode(input: unknown): DataModeV1 | undefined {
  return input === 'LOCAL' || input === 'HYBRID' || input === 'CLOUD'
    ? (input as DataModeV1)
    : undefined;
}

function revision(input: unknown, defaultValue = 1): number | undefined {
  return input === undefined ? defaultValue : boundedInteger(input, 1, Number.MAX_SAFE_INTEGER);
}

function freezeScope(value: TenantScopeV1): TenantScopeV1 {
  return Object.freeze({ ...value });
}

export function createFolderAutopilotProfileV1(input: {
  readonly profileId: unknown;
  readonly tenantScope: unknown;
  readonly version: unknown;
  readonly payloadHash: unknown;
  readonly stabilizationDelayMs: unknown;
  readonly maxFilesPerScan: unknown;
  readonly collisionPolicy: unknown;
  readonly undoWindowSeconds: unknown;
  readonly outputLineageEnabled: unknown;
  readonly createdAt: unknown;
}): FolderAutopilotResultV1<FolderAutopilotProfileV1> {
  const profileId = stable(input.profileId);
  const tenantScope = scope(input.tenantScope);
  const version = boundedInteger(input.version, 1, 10_000);
  const payloadHash = hash(input.payloadHash);
  const stabilizationDelayMs = boundedInteger(input.stabilizationDelayMs, 0, 86_400_000);
  const maxFilesPerScan = boundedInteger(input.maxFilesPerScan, 1, 100_000);
  const undoWindowSeconds = boundedInteger(input.undoWindowSeconds, 0, 604_800);
  const createdAt = timestamp(input.createdAt);
  if (!profileId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (version === undefined) return rejected('INVALID_VERSION');
  if (!payloadHash) return rejected('INVALID_HASH');
  if (
    stabilizationDelayMs === undefined ||
    maxFilesPerScan === undefined ||
    undoWindowSeconds === undefined ||
    typeof input.outputLineageEnabled !== 'boolean'
  )
    return rejected('INVALID_SETTINGS');
  if (
    input.collisionPolicy !== 'REVIEW' &&
    input.collisionPolicy !== 'SKIP' &&
    input.collisionPolicy !== 'UNIQUE_NAME'
  )
    return rejected('INVALID_COLLISION_POLICY');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: FOLDER_AUTOPILOT_SCHEMA_VERSION_V1,
      profileId,
      tenantScope: freezeScope(tenantScope),
      version,
      payloadHash,
      stabilizationDelayMs,
      maxFilesPerScan,
      collisionPolicy: input.collisionPolicy as FolderAutopilotCollisionPolicyV1,
      undoWindowSeconds,
      outputLineageEnabled: input.outputLineageEnabled,
      createdAt,
      revision: 1 as const,
    }),
  });
}

export function createAutopilotFolderBindingV1(input: {
  readonly bindingId: unknown;
  readonly tenantScope: unknown;
  readonly deviceGrantId: unknown;
  readonly role: unknown;
  readonly expectedCapabilityDigest: unknown;
  readonly createdAt: unknown;
}): FolderAutopilotResultV1<AutopilotFolderBindingV1> {
  const bindingId = stable(input.bindingId);
  const tenantScope = scope(input.tenantScope);
  const deviceGrantId = stable(input.deviceGrantId);
  const expectedCapabilityDigest = hash(input.expectedCapabilityDigest);
  const createdAt = timestamp(input.createdAt);
  if (!bindingId || !deviceGrantId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (input.role !== 'INPUT' && input.role !== 'OUTPUT') return rejected('INVALID_ROLE');
  if (!expectedCapabilityDigest) return rejected('INVALID_HASH');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: FOLDER_AUTOPILOT_SCHEMA_VERSION_V1,
      bindingId,
      tenantScope: freezeScope(tenantScope),
      deviceGrantId,
      role: input.role as AutopilotFolderBindingRoleV1,
      expectedCapabilityDigest,
      createdAt,
      revision: 1 as const,
    }),
  });
}

export function createRecipeAssignmentV1(input: {
  readonly assignmentId: unknown;
  readonly tenantScope: unknown;
  readonly profileId: unknown;
  readonly profileVersion: unknown;
  readonly profileHash: unknown;
  readonly jraRecipeVersionId: unknown;
  readonly jraRecipeVersionHash: unknown;
  readonly deviceId: unknown;
  readonly inputBindingIds: unknown;
  readonly outputBindingIds: unknown;
  readonly dataModeConstraint?: unknown;
  readonly effectiveDataModePolicyRef?: unknown;
  readonly idempotencyKey: unknown;
  readonly state?: unknown;
  readonly revision?: unknown;
  readonly createdAt: unknown;
}): FolderAutopilotResultV1<RecipeAssignmentV1> {
  const assignmentId = stable(input.assignmentId);
  const tenantScope = scope(input.tenantScope);
  const profileId = stable(input.profileId);
  const profileVersion = boundedInteger(input.profileVersion, 1, 10_000);
  const profileHash = hash(input.profileHash);
  const jraRecipeVersionId = stable(input.jraRecipeVersionId);
  const jraRecipeVersionHash = hash(input.jraRecipeVersionHash);
  const deviceId = stable(input.deviceId);
  const inputBindingIds = identifiers(input.inputBindingIds);
  const outputBindingIds = identifiers(input.outputBindingIds);
  const constraint =
    input.dataModeConstraint === undefined ? undefined : dataMode(input.dataModeConstraint);
  const effectiveDataModePolicyRef =
    input.effectiveDataModePolicyRef === undefined
      ? undefined
      : stable(input.effectiveDataModePolicyRef);
  const idempotencyKey = text(input.idempotencyKey, 200);
  const assignmentRevision = revision(input.revision);
  const createdAt = timestamp(input.createdAt);
  if (!assignmentId || !profileId || !jraRecipeVersionId || !deviceId)
    return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (profileVersion === undefined) return rejected('INVALID_VERSION');
  if (!profileHash || !jraRecipeVersionHash) return rejected('INVALID_HASH');
  if (!inputBindingIds || !outputBindingIds) return rejected('INVALID_BINDINGS');
  if (inputBindingIds.some((id) => outputBindingIds.includes(id)))
    return rejected('INVALID_BINDINGS');
  if (input.dataModeConstraint !== undefined && !constraint) return rejected('INVALID_DATA_MODE');
  if (input.effectiveDataModePolicyRef !== undefined && !effectiveDataModePolicyRef)
    return rejected('INVALID_POLICY_REFERENCE');
  if (constraint === undefined && effectiveDataModePolicyRef !== undefined)
    return rejected('INVALID_POLICY_REFERENCE');
  if (!idempotencyKey) return rejected('INVALID_IDEMPOTENCY_KEY');
  if (assignmentRevision === undefined) return rejected('INVALID_REVISION');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  const state = input.state ?? 'DRAFT';
  if (state !== 'DRAFT' && state !== 'ACTIVE' && state !== 'PAUSED' && state !== 'RETIRED')
    return rejected('INVALID_STATE');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: FOLDER_AUTOPILOT_SCHEMA_VERSION_V1,
      assignmentId,
      tenantScope: freezeScope(tenantScope),
      profileId,
      profileVersion,
      profileHash,
      jraRecipeVersionId,
      jraRecipeVersionHash,
      deviceId,
      inputBindingIds,
      outputBindingIds,
      ...(constraint === undefined ? {} : { dataModeConstraint: constraint }),
      ...(effectiveDataModePolicyRef === undefined ? {} : { effectiveDataModePolicyRef }),
      idempotencyKey,
      state: state as RecipeAssignmentStateV1,
      revision: assignmentRevision,
      createdAt,
    }),
  });
}

/** Returns true only when a requested assignment mode is no broader than DSO's maximum. */
export function isFolderAutopilotDataModeNarrowingV1(
  maximum: DataModeV1,
  requested: DataModeV1,
): boolean {
  const rank = (mode: DataModeV1): number => (mode === 'LOCAL' ? 0 : mode === 'HYBRID' ? 1 : 2);
  return rank(requested) <= rank(maximum);
}
