import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** IAE-018: independent verification manifest for governed artifact exports. */
export const ARTIFACT_EXPORT_SCHEMA_VERSION_V1 = 1 as const;

export type ExportApprovalStateV1 = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ArtifactExportEntryV1 {
  readonly versionId: StableIdentifierV1;
  readonly contentSha256: string;
  readonly byteSize: number;
  readonly evidenceIds: readonly StableIdentifierV1[];
  readonly processorVersions: readonly string[];
}

export interface ArtifactExportManifestV1 {
  readonly schemaVersion: typeof ARTIFACT_EXPORT_SCHEMA_VERSION_V1;
  readonly manifestId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly entries: readonly ArtifactExportEntryV1[];
  readonly approvalState: ExportApprovalStateV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly canonicalHash: string;
}

export type ArtifactExportErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'CROSS_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_HASH'
  | 'INVALID_ENTRY'
  | 'DUPLICATE_IDENTIFIER'
  | 'INVALID_APPROVAL';

export type ArtifactExportResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ArtifactExportErrorCodeV1 };

function accepted<TValue>(value: TValue): ArtifactExportResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: ArtifactExportErrorCodeV1): ArtifactExportResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function identifier(input: unknown): StableIdentifierV1 | undefined {
  const result = parseStableIdentifierV1(input);
  return result.accepted ? result.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const result = parseStrictUtcTimestampV1(input);
  return result.accepted ? result.value : undefined;
}

function text(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= 128 && !/\p{Cc}/u.test(normalized)
    ? normalized
    : undefined;
}

export function createArtifactExportManifestV1(input: {
  readonly manifestId: unknown;
  readonly tenantScope: unknown;
  readonly entries: unknown;
  readonly approvalState: unknown;
  readonly createdAt: unknown;
  readonly canonicalHash: unknown;
}): ArtifactExportResultV1<ArtifactExportManifestV1> {
  const manifestId = identifier(input.manifestId);
  const tenantScope = parseTenantScopeV1(input.tenantScope);
  const createdAt = timestamp(input.createdAt);
  const canonicalHash =
    typeof input.canonicalHash === 'string' && /^[0-9a-f]{64}$/u.test(input.canonicalHash)
      ? input.canonicalHash.toLowerCase()
      : undefined;
  if (!manifestId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope.accepted) return rejected('INVALID_SCOPE');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (!canonicalHash) return rejected('INVALID_HASH');
  if (!['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'].includes(input.approvalState as string))
    return rejected('INVALID_APPROVAL');
  if (!Array.isArray(input.entries) || input.entries.length === 0 || input.entries.length > 1024)
    return rejected('INVALID_ENTRY');
  const entries: ArtifactExportEntryV1[] = [];
  for (const candidate of input.entries) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
      return rejected('INVALID_ENTRY');
    const record = candidate as Record<string, unknown>;
    const versionId = identifier(record['versionId']);
    const contentSha256 =
      typeof record['contentSha256'] === 'string' && /^[0-9a-f]{64}$/u.test(record['contentSha256'])
        ? record['contentSha256'].toLowerCase()
        : undefined;
    const byteSize = record['byteSize'];
    const evidenceIds = Array.isArray(record['evidenceIds'])
      ? record['evidenceIds'].map(identifier)
      : undefined;
    const processorVersions = Array.isArray(record['processorVersions'])
      ? record['processorVersions'].map(text)
      : undefined;
    if (
      !versionId ||
      !contentSha256 ||
      typeof byteSize !== 'number' ||
      !Number.isSafeInteger(byteSize) ||
      byteSize < 0 ||
      !evidenceIds ||
      evidenceIds.some((value): value is undefined => value === undefined) ||
      !processorVersions ||
      processorVersions.some((value): value is undefined => value === undefined)
    )
      return rejected('INVALID_ENTRY');
    entries.push(
      Object.freeze({
        versionId,
        contentSha256,
        byteSize,
        evidenceIds: Object.freeze(evidenceIds as StableIdentifierV1[]),
        processorVersions: Object.freeze(processorVersions as string[]),
      }),
    );
  }
  if (new Set(entries.map((entry) => entry.versionId)).size !== entries.length)
    return rejected('DUPLICATE_IDENTIFIER');
  if (entries.some((entry) => entry.evidenceIds.some((evidenceId) => !evidenceId)))
    return rejected('INVALID_ENTRY');
  return accepted(
    Object.freeze({
      schemaVersion: ARTIFACT_EXPORT_SCHEMA_VERSION_V1,
      manifestId,
      tenantScope: tenantScope.value,
      entries: Object.freeze(entries),
      approvalState: input.approvalState as ExportApprovalStateV1,
      createdAt,
      canonicalHash,
    }),
  );
}

export function exportScopesEqualV1(
  left: ArtifactExportManifestV1,
  right: ArtifactExportManifestV1,
): boolean {
  return tenantScopesEqualV1(left.tenantScope, right.tenantScope);
}
