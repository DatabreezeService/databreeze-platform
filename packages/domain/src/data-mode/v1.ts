import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '../tenant-scope/v1.js';

/** DSO-007, DSO-008, DSO-026 and DSO-027: signed policy inputs are immutable. */
export const DATA_MODE_POLICY_SCHEMA_VERSION_V1 = 1 as const;

export type DataModeV1 = 'LOCAL' | 'HYBRID' | 'CLOUD';
export type DataClassificationV1 = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type SynchronizationPayloadClassV1 =
  | 'CONTROL_METADATA'
  | 'APPROVED_DERIVED_RESULT'
  | 'RECONSTRUCTABLE_DERIVED_CONTENT'
  | 'ORIGINAL_CONTENT';

export interface DataModePolicyVersionV1 {
  readonly schemaVersion: typeof DATA_MODE_POLICY_SCHEMA_VERSION_V1;
  readonly policyId: StableIdentifierV1;
  readonly policyVersionId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly revision: number;
  readonly mode: DataModeV1;
  readonly allowedPayloadClasses: Readonly<
    Record<DataClassificationV1, readonly SynchronizationPayloadClassV1[]>
  >;
  readonly allowedPlacementKinds: readonly string[];
  readonly allowedExecutorClasses: readonly string[];
  readonly allowedDestinationClasses: readonly string[];
  readonly canonicalHash: string;
  readonly publishedAt: StrictUtcTimestampV1;
}

export type DataModePolicyErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_REVISION'
  | 'INVALID_MODE'
  | 'INVALID_PAYLOAD_CLASS'
  | 'INVALID_COLLECTION'
  | 'INVALID_HASH'
  | 'INVALID_TIMESTAMP'
  | 'POLICY_BROADENS_PARENT';

export type DataModePolicyResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DataModePolicyErrorCodeV1 };

function rejected(code: DataModePolicyErrorCodeV1): DataModePolicyResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function textList(
  input: unknown,
  maxItems: number,
  maxLength: number,
): readonly string[] | undefined {
  if (!Array.isArray(input) || input.length > maxItems) return undefined;
  const values = input.map((item) =>
    typeof item === 'string' && item.length > 0 && item.length <= maxLength
      ? item.normalize('NFC').trim()
      : '',
  );
  if (values.some((value) => value.length === 0 || /\p{Cc}/u.test(value))) return undefined;
  return Object.freeze([...new Set(values)]);
}

const classifications: readonly DataClassificationV1[] = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
];
const payloadClasses: readonly SynchronizationPayloadClassV1[] = [
  'CONTROL_METADATA',
  'APPROVED_DERIVED_RESULT',
  'RECONSTRUCTABLE_DERIVED_CONTENT',
  'ORIGINAL_CONTENT',
];
const modes: readonly DataModeV1[] = ['LOCAL', 'HYBRID', 'CLOUD'];

function payloadMatrix(
  input: unknown,
): Readonly<Record<DataClassificationV1, readonly SynchronizationPayloadClassV1[]>> | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const result = {} as Record<DataClassificationV1, readonly SynchronizationPayloadClassV1[]>;
  for (const classification of classifications) {
    const values = record[classification];
    if (!Array.isArray(values) || values.length > payloadClasses.length) return undefined;
    if (values.some((value) => !payloadClasses.includes(value as SynchronizationPayloadClassV1)))
      return undefined;
    result[classification] = Object.freeze([...new Set(values as SynchronizationPayloadClassV1[])]);
  }
  return Object.freeze(result);
}

function modeRank(mode: DataModeV1): number {
  return mode === 'LOCAL' ? 0 : mode === 'HYBRID' ? 1 : 2;
}

function policyNarrowerOrEqual(
  parent: DataModePolicyVersionV1,
  child: DataModePolicyVersionV1,
): boolean {
  if (modeRank(child.mode) > modeRank(parent.mode)) return false;
  for (const classification of classifications) {
    const parentPayloads = new Set(parent.allowedPayloadClasses[classification]);
    if (child.allowedPayloadClasses[classification].some((payload) => !parentPayloads.has(payload)))
      return false;
  }
  if (child.allowedPlacementKinds.some((kind) => !parent.allowedPlacementKinds.includes(kind)))
    return false;
  if (child.allowedExecutorClasses.some((kind) => !parent.allowedExecutorClasses.includes(kind)))
    return false;
  return !child.allowedDestinationClasses.some(
    (kind) => !parent.allowedDestinationClasses.includes(kind),
  );
}

export function createDataModePolicyVersionV1(input: {
  readonly policyId: unknown;
  readonly policyVersionId: unknown;
  readonly workspaceId: unknown;
  readonly revision: unknown;
  readonly mode: unknown;
  readonly allowedPayloadClasses: unknown;
  readonly allowedPlacementKinds: unknown;
  readonly allowedExecutorClasses: unknown;
  readonly allowedDestinationClasses: unknown;
  readonly canonicalHash: unknown;
  readonly publishedAt: unknown;
}): DataModePolicyResultV1<DataModePolicyVersionV1> {
  const policyId = stable(input.policyId);
  const policyVersionId = stable(input.policyVersionId);
  const workspaceId = stable(input.workspaceId);
  const revision = input.revision;
  const mode = input.mode;
  const allowedPayloadClasses = payloadMatrix(input.allowedPayloadClasses);
  const allowedPlacementKinds = textList(input.allowedPlacementKinds, 32, 64);
  const allowedExecutorClasses = textList(input.allowedExecutorClasses, 32, 64);
  const allowedDestinationClasses = textList(input.allowedDestinationClasses, 32, 64);
  const canonicalHash = input.canonicalHash;
  const publishedAt = timestamp(input.publishedAt);
  if (!policyId || !policyVersionId || !workspaceId) return rejected('INVALID_IDENTIFIER');
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1)
    return rejected('INVALID_REVISION');
  if (!modes.includes(mode as DataModeV1)) return rejected('INVALID_MODE');
  if (!allowedPayloadClasses) return rejected('INVALID_PAYLOAD_CLASS');
  if (!allowedPlacementKinds || !allowedExecutorClasses || !allowedDestinationClasses)
    return rejected('INVALID_COLLECTION');
  if (typeof canonicalHash !== 'string' || !/^[a-f0-9]{64}$/u.test(canonicalHash))
    return rejected('INVALID_HASH');
  if (!publishedAt) return rejected('INVALID_TIMESTAMP');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: DATA_MODE_POLICY_SCHEMA_VERSION_V1,
      policyId,
      policyVersionId,
      workspaceId,
      revision,
      mode: mode as DataModeV1,
      allowedPayloadClasses,
      allowedPlacementKinds,
      allowedExecutorClasses,
      allowedDestinationClasses,
      canonicalHash,
      publishedAt,
    }),
  });
}

export function ensureDataModePolicyNarrowingV1(
  parent: DataModePolicyVersionV1,
  child: DataModePolicyVersionV1,
): DataModePolicyResultV1<true> {
  if (parent.workspaceId !== child.workspaceId || parent.policyId !== child.policyId)
    return rejected('POLICY_BROADENS_PARENT');
  return policyNarrowerOrEqual(parent, child)
    ? Object.freeze({ accepted: true, value: true })
    : rejected('POLICY_BROADENS_PARENT');
}

export function isDataModePayloadAllowedV1(
  policy: DataModePolicyVersionV1,
  classification: DataClassificationV1,
  payloadClass: SynchronizationPayloadClassV1,
): boolean {
  return policy.allowedPayloadClasses[classification]?.includes(payloadClass) ?? false;
}
