import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';
import type { ArtifactDataModeV1, EvidenceSourceStateV1 } from '../artifact/v1.js';

/** IAE-005, IAE-006: short-lived, opaque evidence grants. */
export const EVIDENCE_GRANT_SCHEMA_VERSION_V1 = 1 as const;
export type EvidenceGrantActionV1 = 'COORDINATE' | 'EXCERPT' | 'OPEN_ON_DEVICE';

export interface EvidenceAccessGrantV1 {
  readonly schemaVersion: typeof EVIDENCE_GRANT_SCHEMA_VERSION_V1;
  readonly grantId: StableIdentifierV1;
  readonly evidenceId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly recipientDeviceId: StableIdentifierV1;
  readonly action: EvidenceGrantActionV1;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly authorizationEpoch: number;
  readonly maxExcerptBytes: number;
}

export type EvidenceGrantErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_ACTION'
  | 'INVALID_EPOCH'
  | 'INVALID_BYTES'
  | 'EXPIRY_TOO_LONG'
  | 'LOCAL_CONTENT_LEAK'
  | 'SOURCE_UNAVAILABLE';

export type EvidenceGrantResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: EvidenceGrantErrorCodeV1 };

function accepted<TValue>(value: TValue): EvidenceGrantResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: EvidenceGrantErrorCodeV1): EvidenceGrantResultV1<never> {
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

export function createEvidenceAccessGrantV1(input: {
  readonly grantId: unknown;
  readonly evidenceId: unknown;
  readonly artifactVersionId: unknown;
  readonly tenantScope: unknown;
  readonly recipientDeviceId: unknown;
  readonly action: unknown;
  readonly issuedAt: unknown;
  readonly expiresAt: unknown;
  readonly authorizationEpoch: unknown;
  readonly maxExcerptBytes?: unknown;
  readonly artifactDataMode: ArtifactDataModeV1;
  readonly sourceState: EvidenceSourceStateV1;
}): EvidenceGrantResultV1<EvidenceAccessGrantV1> {
  const grantId = identifier(input.grantId);
  const evidenceId = identifier(input.evidenceId);
  const artifactVersionId = identifier(input.artifactVersionId);
  const tenantScope = scope(input.tenantScope);
  const recipientDeviceId = identifier(input.recipientDeviceId);
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = timestamp(input.expiresAt);
  if (!grantId || !evidenceId || !artifactVersionId || !recipientDeviceId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!issuedAt || !expiresAt || Date.parse(expiresAt) <= Date.parse(issuedAt)) return rejected('INVALID_TIMESTAMP');
  if (Date.parse(expiresAt) - Date.parse(issuedAt) > 15 * 60 * 1000) return rejected('EXPIRY_TOO_LONG');
  if (!['COORDINATE', 'EXCERPT', 'OPEN_ON_DEVICE'].includes(input.action as string)) return rejected('INVALID_ACTION');
  if (!['AVAILABLE', 'SOURCE_OFFLINE', 'DELETED'].includes(input.sourceState)) return rejected('SOURCE_UNAVAILABLE');
  if (input.action === 'OPEN_ON_DEVICE' && input.artifactDataMode !== 'Local') return rejected('INVALID_ACTION');
  if (input.action === 'EXCERPT' && input.artifactDataMode === 'Local') return rejected('LOCAL_CONTENT_LEAK');
  if (input.action === 'EXCERPT' && input.sourceState !== 'AVAILABLE') return rejected('SOURCE_UNAVAILABLE');
  if (typeof input.authorizationEpoch !== 'number' || !Number.isSafeInteger(input.authorizationEpoch) || input.authorizationEpoch < 1) return rejected('INVALID_EPOCH');
  const maxExcerptBytes = input.maxExcerptBytes ?? (input.action === 'EXCERPT' ? 512 : 0);
  if (typeof maxExcerptBytes !== 'number' || !Number.isSafeInteger(maxExcerptBytes) || maxExcerptBytes < 0 || maxExcerptBytes > 4096) return rejected('INVALID_BYTES');
  if (input.action !== 'EXCERPT' && maxExcerptBytes !== 0) return rejected('INVALID_BYTES');
  return accepted(Object.freeze({
    schemaVersion: EVIDENCE_GRANT_SCHEMA_VERSION_V1,
    grantId,
    evidenceId,
    artifactVersionId,
    tenantScope,
    recipientDeviceId,
    action: input.action as EvidenceGrantActionV1,
    issuedAt,
    expiresAt,
    authorizationEpoch: input.authorizationEpoch,
    maxExcerptBytes,
  }));
}

export function evidenceGrantMatchesScopeV1(grant: EvidenceAccessGrantV1, scopeInput: unknown): boolean {
  const candidate = scope(scopeInput);
  return candidate !== undefined && tenantScopesEqualV1(candidate, grant.tenantScope);
}
