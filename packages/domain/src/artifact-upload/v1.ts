import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** IAE-014: resumable multipart upload state is bounded, revisioned, and content-addressed. */
export const ARTIFACT_UPLOAD_SCHEMA_VERSION_V1 = 1 as const;
export type ArtifactUploadStateV1 = 'OPEN' | 'COMPLETED' | 'ABORTED' | 'EXPIRED';

export interface ArtifactUploadPartV1 {
  readonly partNumber: number;
  readonly contentSha256: string;
  readonly byteSize: number;
  readonly uploadedAt: StrictUtcTimestampV1;
}

export interface ArtifactUploadSessionV1 {
  readonly schemaVersion: typeof ARTIFACT_UPLOAD_SCHEMA_VERSION_V1;
  readonly sessionId: StableIdentifierV1;
  readonly artifactId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly expectedSha256: string;
  readonly expectedByteSize: number;
  readonly mediaType: string;
  readonly partSize: number;
  readonly totalParts: number;
  readonly parts: readonly ArtifactUploadPartV1[];
  readonly state: ArtifactUploadStateV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly revision: number;
}

export type ArtifactUploadErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_HASH'
  | 'INVALID_SIZE'
  | 'INVALID_MEDIA_TYPE'
  | 'INVALID_PART'
  | 'INVALID_STATE'
  | 'REVISION_CONFLICT'
  | 'MISSING_PARTS'
  | 'SIZE_MISMATCH'
  | 'DIGEST_MISMATCH'
  | 'EXPIRED';

export type ArtifactUploadResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ArtifactUploadErrorCodeV1 };

function accepted<TValue>(value: TValue): ArtifactUploadResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: ArtifactUploadErrorCodeV1): ArtifactUploadResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function identifier(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
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

function mediaType(input: unknown): string | undefined {
  return typeof input === 'string' &&
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(input)
    ? input.toLowerCase()
    : undefined;
}

function positiveInteger(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input > 0 ? input : undefined;
}

function validPart(part: unknown, totalParts: number): part is ArtifactUploadPartV1 {
  if (typeof part !== 'object' || part === null || Array.isArray(part)) return false;
  const record = part as Record<string, unknown>;
  return (
    typeof record['partNumber'] === 'number' &&
    Number.isSafeInteger(record['partNumber']) &&
    record['partNumber'] >= 1 &&
    record['partNumber'] <= totalParts &&
    hash(record['contentSha256']) !== undefined &&
    typeof record['byteSize'] === 'number' &&
    Number.isSafeInteger(record['byteSize']) &&
    record['byteSize'] >= 0 &&
    timestamp(record['uploadedAt']) !== undefined
  );
}

export function createArtifactUploadSessionV1(input: {
  readonly sessionId: unknown;
  readonly artifactId: unknown;
  readonly tenantScope: unknown;
  readonly expectedSha256: unknown;
  readonly expectedByteSize: unknown;
  readonly mediaType: unknown;
  readonly partSize: unknown;
  readonly createdAt: unknown;
  readonly expiresAt: unknown;
}): ArtifactUploadResultV1<ArtifactUploadSessionV1> {
  const sessionId = identifier(input.sessionId);
  const artifactId = identifier(input.artifactId);
  const tenantScope = parseTenantScopeV1(input.tenantScope);
  const expectedSha256 = hash(input.expectedSha256);
  const partSize = positiveInteger(input.partSize);
  const mediaTypeValue = mediaType(input.mediaType);
  const createdAt = timestamp(input.createdAt);
  const expiresAt = timestamp(input.expiresAt);
  if (!sessionId || !artifactId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope.accepted) return rejected('INVALID_SCOPE');
  if (!expectedSha256) return rejected('INVALID_HASH');
  if (
    typeof input.expectedByteSize !== 'number' ||
    !Number.isSafeInteger(input.expectedByteSize) ||
    input.expectedByteSize < 0
  )
    return rejected('INVALID_SIZE');
  if (!partSize || partSize > 1024 * 1024 * 1024) return rejected('INVALID_SIZE');
  if (!mediaTypeValue) return rejected('INVALID_MEDIA_TYPE');
  if (!createdAt || !expiresAt || Date.parse(expiresAt) <= Date.parse(createdAt))
    return rejected('INVALID_TIMESTAMP');
  const totalParts = Math.max(1, Math.ceil(input.expectedByteSize / partSize));
  if (totalParts > 10_000) return rejected('INVALID_SIZE');
  return accepted(
    Object.freeze({
      schemaVersion: ARTIFACT_UPLOAD_SCHEMA_VERSION_V1,
      sessionId,
      artifactId,
      tenantScope: tenantScope.value,
      expectedSha256,
      expectedByteSize: input.expectedByteSize,
      mediaType: mediaTypeValue,
      partSize,
      totalParts,
      parts: Object.freeze([]),
      state: 'OPEN' as const,
      createdAt,
      expiresAt,
      revision: 1,
    }),
  );
}

export function recordArtifactUploadPartV1(
  session: ArtifactUploadSessionV1,
  input: {
    readonly partNumber: unknown;
    readonly contentSha256: unknown;
    readonly byteSize: unknown;
    readonly uploadedAt: unknown;
    readonly expectedRevision: unknown;
  },
): ArtifactUploadResultV1<ArtifactUploadSessionV1> {
  if (session.state !== 'OPEN') return rejected('INVALID_STATE');
  if (Date.parse(input.uploadedAt as string) > Date.parse(session.expiresAt))
    return rejected('EXPIRED');
  if (input.expectedRevision !== session.revision) return rejected('REVISION_CONFLICT');
  const partNumber = input.partNumber;
  const contentSha256 = hash(input.contentSha256);
  const byteSize = input.byteSize;
  const uploadedAt = timestamp(input.uploadedAt);
  if (
    typeof partNumber !== 'number' ||
    !Number.isSafeInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > session.totalParts ||
    !contentSha256 ||
    typeof byteSize !== 'number' ||
    !Number.isSafeInteger(byteSize) ||
    byteSize < 0 ||
    !uploadedAt ||
    byteSize > session.partSize ||
    (partNumber < session.totalParts && byteSize !== session.partSize)
  )
    return rejected('INVALID_PART');
  const existing = session.parts.find((part) => part.partNumber === partNumber);
  if (existing) {
    return existing.contentSha256 === contentSha256 && existing.byteSize === byteSize
      ? accepted(session)
      : rejected('DIGEST_MISMATCH');
  }
  const part = Object.freeze({ partNumber, contentSha256, byteSize, uploadedAt });
  return accepted(
    Object.freeze({
      ...session,
      parts: Object.freeze(
        [...session.parts, part].sort((left, right) => left.partNumber - right.partNumber),
      ),
      revision: session.revision + 1,
    }),
  );
}

export function completeArtifactUploadSessionV1(
  session: ArtifactUploadSessionV1,
  input: { readonly assembledSha256: unknown; readonly expectedRevision: unknown },
): ArtifactUploadResultV1<ArtifactUploadSessionV1> {
  if (session.state !== 'OPEN') return rejected('INVALID_STATE');
  if (input.expectedRevision !== session.revision) return rejected('REVISION_CONFLICT');
  const assembledSha256 = hash(input.assembledSha256);
  if (!assembledSha256) return rejected('INVALID_HASH');
  if (session.parts.length !== session.totalParts) return rejected('MISSING_PARTS');
  if (session.parts.some((part, index) => part.partNumber !== index + 1))
    return rejected('MISSING_PARTS');
  if (session.parts.reduce((total, part) => total + part.byteSize, 0) !== session.expectedByteSize)
    return rejected('SIZE_MISMATCH');
  if (assembledSha256 !== session.expectedSha256) return rejected('DIGEST_MISMATCH');
  return accepted(
    Object.freeze({ ...session, state: 'COMPLETED' as const, revision: session.revision + 1 }),
  );
}

export function abortArtifactUploadSessionV1(
  session: ArtifactUploadSessionV1,
  expectedRevision: unknown,
): ArtifactUploadResultV1<ArtifactUploadSessionV1> {
  if (session.state !== 'OPEN') return rejected('INVALID_STATE');
  if (expectedRevision !== session.revision) return rejected('REVISION_CONFLICT');
  return accepted(
    Object.freeze({ ...session, state: 'ABORTED' as const, revision: session.revision + 1 }),
  );
}

export function expireArtifactUploadSessionV1(
  session: ArtifactUploadSessionV1,
  now: unknown,
): ArtifactUploadResultV1<ArtifactUploadSessionV1> {
  const timestampValue = timestamp(now);
  if (!timestampValue) return rejected('INVALID_TIMESTAMP');
  if (session.state !== 'OPEN') return rejected('INVALID_STATE');
  if (Date.parse(timestampValue) < Date.parse(session.expiresAt))
    return rejected('INVALID_TIMESTAMP');
  return accepted(
    Object.freeze({ ...session, state: 'EXPIRED' as const, revision: session.revision + 1 }),
  );
}

export function isArtifactUploadPartV1(
  part: unknown,
  totalParts: number,
): part is ArtifactUploadPartV1 {
  return validPart(part, totalParts);
}
