import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';
import type { ArtifactVersionV1 } from '../artifact/v1.js';

/** IAE-001, IAE-009, IAE-010, IAE-013: intake admission is explicit and idempotent. */
export const ARTIFACT_INTAKE_SCHEMA_VERSION_V1 = 1 as const;

export type InboxItemStateV1 =
  | 'NEW'
  | 'ROUTED'
  | 'NEEDS_REVIEW'
  | 'PROCESSING'
  | 'RESOLVED'
  | 'QUARANTINED'
  | 'ARCHIVED';
export type ArtifactScanStateV1 = 'PENDING' | 'CLEAN' | 'MALICIOUS' | 'FAILED';

export interface InboxItemV1 {
  readonly schemaVersion: typeof ARTIFACT_INTAKE_SCHEMA_VERSION_V1;
  readonly inboxItemId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly idempotencyKey: string;
  readonly artifactVersionId: StableIdentifierV1;
  readonly state: InboxItemStateV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly revision: number;
}

export type ArtifactIntakeErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TEXT'
  | 'INVALID_STATE'
  | 'INVALID_TRANSITION'
  | 'INVALID_HASH'
  | 'INVALID_SIZE'
  | 'INVALID_MEDIA_TYPE'
  | 'DIGEST_MISMATCH'
  | 'SIZE_MISMATCH'
  | 'MEDIA_MISMATCH'
  | 'SIZE_POLICY_EXCEEDED'
  | 'SCAN_NOT_COMPLETE';

export type ArtifactIntakeResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ArtifactIntakeErrorCodeV1 };

function accepted<TValue>(value: TValue): ArtifactIntakeResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: ArtifactIntakeErrorCodeV1): ArtifactIntakeResultV1<never> {
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

function mediaType(input: unknown): string | undefined {
  return typeof input === 'string' &&
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(input)
    ? input.toLowerCase()
    : undefined;
}

const transitions: Readonly<Record<InboxItemStateV1, readonly InboxItemStateV1[]>> = {
  NEW: ['ROUTED', 'NEEDS_REVIEW', 'PROCESSING', 'QUARANTINED'],
  ROUTED: ['NEEDS_REVIEW', 'PROCESSING', 'QUARANTINED', 'ARCHIVED'],
  NEEDS_REVIEW: ['ROUTED', 'PROCESSING', 'QUARANTINED', 'ARCHIVED'],
  PROCESSING: ['RESOLVED', 'NEEDS_REVIEW', 'QUARANTINED'],
  RESOLVED: ['ARCHIVED'],
  QUARANTINED: ['NEEDS_REVIEW', 'ARCHIVED'],
  ARCHIVED: [],
};

export function createInboxItemV1(input: {
  readonly inboxItemId: unknown;
  readonly tenantScope: unknown;
  readonly idempotencyKey: unknown;
  readonly artifactVersionId: unknown;
  readonly createdAt: unknown;
}): ArtifactIntakeResultV1<InboxItemV1> {
  const inboxItemId = identifier(input.inboxItemId);
  const tenantScope = scope(input.tenantScope);
  const artifactVersionId = identifier(input.artifactVersionId);
  const idempotencyKey = text(input.idempotencyKey, 200);
  const createdAt = timestamp(input.createdAt);
  if (!inboxItemId || !artifactVersionId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!idempotencyKey) return rejected('INVALID_TEXT');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  return accepted(
    Object.freeze({
      schemaVersion: ARTIFACT_INTAKE_SCHEMA_VERSION_V1,
      inboxItemId,
      tenantScope,
      idempotencyKey,
      artifactVersionId,
      state: 'NEW' as const,
      createdAt,
      revision: 1,
    }),
  );
}

export function transitionInboxItemV1(
  item: InboxItemV1,
  nextStateInput: unknown,
): ArtifactIntakeResultV1<InboxItemV1> {
  if (!Object.hasOwn(transitions, nextStateInput as string)) return rejected('INVALID_STATE');
  const nextState = nextStateInput as InboxItemStateV1;
  if (!transitions[item.state].includes(nextState)) return rejected('INVALID_TRANSITION');
  return accepted(Object.freeze({ ...item, state: nextState, revision: item.revision + 1 }));
}

export function finalizeArtifactAdmissionV1(input: {
  readonly artifact: ArtifactVersionV1;
  readonly actualSha256: unknown;
  readonly actualByteSize: unknown;
  readonly detectedMediaType: unknown;
  readonly scanState: unknown;
  readonly maxByteSize: unknown;
}): ArtifactIntakeResultV1<{
  readonly status: 'ACTIVE' | 'QUARANTINED';
  readonly scanState: ArtifactScanStateV1;
}> {
  const actualSha256 = hash(input.actualSha256);
  const detectedMediaType = mediaType(input.detectedMediaType);
  if (!actualSha256) return rejected('INVALID_HASH');
  if (!detectedMediaType) return rejected('INVALID_MEDIA_TYPE');
  if (
    typeof input.actualByteSize !== 'number' ||
    !Number.isSafeInteger(input.actualByteSize) ||
    input.actualByteSize < 0
  )
    return rejected('INVALID_SIZE');
  if (
    typeof input.maxByteSize !== 'number' ||
    !Number.isSafeInteger(input.maxByteSize) ||
    input.maxByteSize < 0
  )
    return rejected('INVALID_SIZE');
  if (!['PENDING', 'CLEAN', 'MALICIOUS', 'FAILED'].includes(input.scanState as string))
    return rejected('INVALID_STATE');
  const scanState = input.scanState as ArtifactScanStateV1;
  if (actualSha256 !== input.artifact.contentSha256) return rejected('DIGEST_MISMATCH');
  if (input.actualByteSize !== input.artifact.byteSize) return rejected('SIZE_MISMATCH');
  if (detectedMediaType !== input.artifact.mediaType) return rejected('MEDIA_MISMATCH');
  if (input.actualByteSize > input.maxByteSize) return rejected('SIZE_POLICY_EXCEEDED');
  if (scanState === 'PENDING' || scanState === 'FAILED') return rejected('SCAN_NOT_COMPLETE');
  return accepted({
    status: scanState === 'MALICIOUS' ? 'QUARANTINED' : 'ACTIVE',
    scanState,
  });
}

export function intakeScopesEqualV1(left: InboxItemV1, right: InboxItemV1): boolean {
  return tenantScopesEqualV1(left.tenantScope, right.tenantScope);
}
