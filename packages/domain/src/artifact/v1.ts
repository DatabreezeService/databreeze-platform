import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** IAE-001..IAE-006: immutable artifacts, opaque placements, and typed evidence. */
export const ARTIFACT_SCHEMA_VERSION_V1 = 1 as const;

export type ArtifactDataModeV1 = 'Local' | 'Hybrid' | 'Cloud';
export type ArtifactSourceKindV1 = 'FILE' | 'FOLDER' | 'CAPTURE' | 'GENERATED';
export type ArtifactVersionStatusV1 = 'QUARANTINED' | 'ACTIVE' | 'DELETED';
export type ArtifactPlacementKindV1 = 'LOCAL' | 'CLOUD';
export type EvidenceSourceStateV1 = 'AVAILABLE' | 'SOURCE_OFFLINE' | 'DELETED';

export type EvidenceGeometryV1 =
  | {
      readonly kind: 'SPREADSHEET';
      readonly sheets: readonly {
        readonly name: string;
        readonly maxRow: number;
        readonly maxColumn: number;
      }[];
    }
  | { readonly kind: 'PAGED'; readonly maxPage: number }
  | { readonly kind: 'TABULAR'; readonly maxRow: number };

export interface ArtifactVersionV1 {
  readonly schemaVersion: typeof ARTIFACT_SCHEMA_VERSION_V1;
  readonly artifactId: StableIdentifierV1;
  readonly versionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly sourceKind: ArtifactSourceKindV1;
  readonly dataMode: ArtifactDataModeV1;
  readonly contentSha256: string;
  readonly byteSize: number;
  readonly mediaType: string;
  readonly displayName: string;
  readonly createdAt: StrictUtcTimestampV1;
  readonly status: ArtifactVersionStatusV1;
}

export interface ContentPlacementV1 {
  readonly schemaVersion: typeof ARTIFACT_SCHEMA_VERSION_V1;
  readonly placementId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly kind: ArtifactPlacementKindV1;
  /** Opaque reference only; never a path, URL, bucket key, or source value. */
  readonly opaqueReference: string;
  readonly contentSha256: string;
  readonly available: boolean;
  readonly revision: number;
}

export type EvidenceCoordinateV1 =
  | { readonly kind: 'CELL'; readonly sheet: string; readonly address: string }
  | { readonly kind: 'PAGE'; readonly page: number; readonly label?: string }
  | { readonly kind: 'ROW'; readonly row: number; readonly field?: string };

export interface EvidenceReferenceV1 {
  readonly schemaVersion: typeof ARTIFACT_SCHEMA_VERSION_V1;
  readonly evidenceId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly coordinate: EvidenceCoordinateV1;
  readonly sourceState: EvidenceSourceStateV1;
  readonly excerpt?: string;
}

export type ArtifactErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_MODE'
  | 'INVALID_KIND'
  | 'INVALID_HASH'
  | 'INVALID_SIZE'
  | 'INVALID_MEDIA_TYPE'
  | 'INVALID_NAME'
  | 'INVALID_STATUS'
  | 'INVALID_REVISION'
  | 'INVALID_REFERENCE'
  | 'INVALID_COORDINATE'
  | 'COORDINATE_OUT_OF_BOUNDS'
  | 'INVALID_SOURCE_STATE'
  | 'CONTENT_MISMATCH'
  | 'LOCAL_CONTENT_LEAK';

export type ArtifactResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ArtifactErrorCodeV1 };

function accepted<TValue>(value: TValue): ArtifactResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: ArtifactErrorCodeV1): ArtifactResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stableId(input: unknown): StableIdentifierV1 | undefined {
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

function hasControlCharacter(input: string): boolean {
  for (const character of input) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

function boundedText(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (hasControlCharacter(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function displayName(input: unknown): string | undefined {
  const value = boundedText(input, 255);
  return value && !value.includes('/') && !value.includes('\\') ? value : undefined;
}

function sha256(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input)
    ? input.toLowerCase()
    : undefined;
}

function opaqueReference(input: unknown): string | undefined {
  return typeof input === 'string' && /^[A-Za-z0-9_-]{16,512}$/u.test(input) ? input : undefined;
}

function mediaType(input: unknown): string | undefined {
  return typeof input === 'string' &&
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(input)
    ? input.toLowerCase()
    : undefined;
}

function positiveRevision(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

function isMode(input: unknown): input is ArtifactDataModeV1 {
  return input === 'Local' || input === 'Hybrid' || input === 'Cloud';
}

function isSourceKind(input: unknown): input is ArtifactSourceKindV1 {
  return input === 'FILE' || input === 'FOLDER' || input === 'CAPTURE' || input === 'GENERATED';
}

function isStatus(input: unknown): input is ArtifactVersionStatusV1 {
  return input === 'QUARANTINED' || input === 'ACTIVE' || input === 'DELETED';
}

export function createArtifactVersionV1(input: {
  readonly artifactId: unknown;
  readonly versionId: unknown;
  readonly tenantScope: unknown;
  readonly sourceKind: unknown;
  readonly dataMode: unknown;
  readonly contentSha256: unknown;
  readonly byteSize: unknown;
  readonly mediaType: unknown;
  readonly displayName: unknown;
  readonly createdAt: unknown;
  readonly status?: unknown;
}): ArtifactResultV1<ArtifactVersionV1> {
  const artifactId = stableId(input.artifactId);
  const versionId = stableId(input.versionId);
  const tenantScope = scope(input.tenantScope);
  const contentSha256 = sha256(input.contentSha256);
  const mediaTypeValue = mediaType(input.mediaType);
  const displayNameValue = displayName(input.displayName);
  const createdAt = timestamp(input.createdAt);
  const status = input.status ?? 'ACTIVE';
  if (!artifactId || !versionId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!isSourceKind(input.sourceKind)) return rejected('INVALID_KIND');
  if (!isMode(input.dataMode)) return rejected('INVALID_MODE');
  if (!contentSha256) return rejected('INVALID_HASH');
  if (
    typeof input.byteSize !== 'number' ||
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize < 0
  )
    return rejected('INVALID_SIZE');
  if (!mediaTypeValue) return rejected('INVALID_MEDIA_TYPE');
  if (!displayNameValue) return rejected('INVALID_NAME');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (!isStatus(status)) return rejected('INVALID_STATUS');
  return accepted(
    Object.freeze({
      schemaVersion: ARTIFACT_SCHEMA_VERSION_V1,
      artifactId,
      versionId,
      tenantScope,
      sourceKind: input.sourceKind,
      dataMode: input.dataMode,
      contentSha256,
      byteSize: input.byteSize,
      mediaType: mediaTypeValue,
      displayName: displayNameValue,
      createdAt,
      status,
    }),
  );
}

export function createContentPlacementV1(input: {
  readonly placementId: unknown;
  readonly artifactVersion: ArtifactVersionV1;
  readonly tenantScope: unknown;
  readonly kind: unknown;
  readonly opaqueReference: unknown;
  readonly contentSha256: unknown;
  readonly available?: unknown;
  readonly revision?: unknown;
}): ArtifactResultV1<ContentPlacementV1> {
  const placementId = stableId(input.placementId);
  const tenantScope = scope(input.tenantScope);
  const opaqueReferenceValue = opaqueReference(input.opaqueReference);
  const contentSha256 = sha256(input.contentSha256);
  const revision = input.revision === undefined ? 1 : positiveRevision(input.revision);
  if (!placementId || !stableId(input.artifactVersion.versionId))
    return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!tenantScopesEqualV1(tenantScope, input.artifactVersion.tenantScope))
    return rejected('INVALID_SCOPE');
  if (input.kind !== 'LOCAL' && input.kind !== 'CLOUD') return rejected('INVALID_KIND');
  if (!opaqueReferenceValue) return rejected('INVALID_REFERENCE');
  if (!contentSha256 || contentSha256 !== input.artifactVersion.contentSha256)
    return rejected('CONTENT_MISMATCH');
  if (!revision) return rejected('INVALID_REVISION');
  if (input.artifactVersion.dataMode === 'Local' && input.kind !== 'LOCAL')
    return rejected('LOCAL_CONTENT_LEAK');
  if (input.artifactVersion.dataMode === 'Cloud' && input.kind !== 'CLOUD')
    return rejected('INVALID_MODE');
  if (input.available !== undefined && typeof input.available !== 'boolean')
    return rejected('INVALID_STATUS');
  return accepted(
    Object.freeze({
      schemaVersion: ARTIFACT_SCHEMA_VERSION_V1,
      placementId,
      artifactVersionId: input.artifactVersion.versionId,
      tenantScope,
      kind: input.kind,
      opaqueReference: opaqueReferenceValue,
      contentSha256,
      available: input.available ?? true,
      revision,
    }),
  );
}

function evidenceCoordinate(input: unknown): EvidenceCoordinateV1 | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  if (record['kind'] === 'CELL') {
    const sheet = boundedText(record['sheet'], 255);
    const address = boundedText(record['address'], 64);
    return sheet && address && !sheet.includes('/') && !sheet.includes('\\')
      ? Object.freeze({ kind: 'CELL', sheet, address })
      : undefined;
  }
  if (record['kind'] === 'PAGE') {
    const page = record['page'];
    const label = record['label'] === undefined ? undefined : boundedText(record['label'], 128);
    return typeof page === 'number' &&
      Number.isSafeInteger(page) &&
      page >= 1 &&
      (record['label'] === undefined || label)
      ? Object.freeze({ kind: 'PAGE', page, ...(label ? { label } : {}) })
      : undefined;
  }
  if (record['kind'] === 'ROW') {
    const row = record['row'];
    const field = record['field'] === undefined ? undefined : boundedText(record['field'], 128);
    return typeof row === 'number' &&
      Number.isSafeInteger(row) &&
      row >= 1 &&
      (record['field'] === undefined || field)
      ? Object.freeze({ kind: 'ROW', row, ...(field ? { field } : {}) })
      : undefined;
  }
  return undefined;
}

function spreadsheetColumnNumber(value: string): number {
  let result = 0;
  for (const character of value) result = result * 26 + character.charCodeAt(0) - 64;
  return result;
}

/** IAE-006: evidence coordinates are checked against the exact source geometry. */
export function validateEvidenceCoordinateV1(
  coordinate: EvidenceCoordinateV1,
  geometry?: EvidenceGeometryV1,
): ArtifactResultV1<true> {
  if (!geometry) return accepted(true);
  if (coordinate.kind === 'CELL') {
    if (geometry.kind !== 'SPREADSHEET') return rejected('COORDINATE_OUT_OF_BOUNDS');
    const sheet = geometry.sheets.find((candidate) => candidate.name === coordinate.sheet);
    const address = /^\$?([A-Z]{1,3})\$?([1-9][0-9]*)$/u.exec(coordinate.address.toUpperCase());
    if (!sheet || !address) return rejected('COORDINATE_OUT_OF_BOUNDS');
    const column = spreadsheetColumnNumber(address[1] ?? '');
    const row = Number(address[2]);
    return row <= sheet.maxRow && column <= sheet.maxColumn
      ? accepted(true)
      : rejected('COORDINATE_OUT_OF_BOUNDS');
  }
  if (coordinate.kind === 'PAGE') {
    return geometry.kind === 'PAGED' && coordinate.page <= geometry.maxPage
      ? accepted(true)
      : rejected('COORDINATE_OUT_OF_BOUNDS');
  }
  return geometry.kind === 'TABULAR' && coordinate.row <= geometry.maxRow
    ? accepted(true)
    : rejected('COORDINATE_OUT_OF_BOUNDS');
}

export function createEvidenceReferenceV1(input: {
  readonly evidenceId: unknown;
  readonly artifactVersion: ArtifactVersionV1;
  readonly tenantScope: unknown;
  readonly coordinate: unknown;
  readonly geometry?: unknown;
  readonly sourceState?: unknown;
  readonly excerpt?: unknown;
}): ArtifactResultV1<EvidenceReferenceV1> {
  const evidenceId = stableId(input.evidenceId);
  const tenantScope = scope(input.tenantScope);
  const coordinate = evidenceCoordinate(input.coordinate);
  const sourceState = input.sourceState ?? 'AVAILABLE';
  const excerpt = input.excerpt === undefined ? undefined : boundedText(input.excerpt, 512);
  if (!evidenceId || !stableId(input.artifactVersion.versionId))
    return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!tenantScopesEqualV1(tenantScope, input.artifactVersion.tenantScope))
    return rejected('INVALID_SCOPE');
  if (!coordinate) return rejected('INVALID_COORDINATE');
  if (input.geometry !== undefined) {
    const geometry = input.geometry as EvidenceGeometryV1;
    const coordinateCheck = validateEvidenceCoordinateV1(coordinate, geometry);
    if (!coordinateCheck.accepted) return coordinateCheck;
  }
  if (sourceState !== 'AVAILABLE' && sourceState !== 'SOURCE_OFFLINE' && sourceState !== 'DELETED')
    return rejected('INVALID_SOURCE_STATE');
  if (input.excerpt !== undefined && !excerpt) return rejected('INVALID_REFERENCE');
  if (input.artifactVersion.dataMode === 'Local' && excerpt !== undefined)
    return rejected('LOCAL_CONTENT_LEAK');
  return accepted(
    Object.freeze({
      schemaVersion: ARTIFACT_SCHEMA_VERSION_V1,
      evidenceId,
      artifactVersionId: input.artifactVersion.versionId,
      tenantScope,
      coordinate,
      sourceState,
      ...(excerpt === undefined ? {} : { excerpt }),
    }),
  );
}
