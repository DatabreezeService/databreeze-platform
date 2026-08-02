import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';
import type { ArtifactRetentionEvaluationV1 } from '../artifact-governance/v1.js';

/** IAE-016, IAE-021: explicit, auditable deletion requests separate from byte erasure. */
export const ARTIFACT_RETENTION_SCHEMA_VERSION_V1 = 1 as const;

export type ArtifactDeletionStateV1 =
  | 'REQUESTED'
  | 'BLOCKED'
  | 'AUTHORIZED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ArtifactDeletionRequestV1 {
  readonly schemaVersion: typeof ARTIFACT_RETENTION_SCHEMA_VERSION_V1;
  readonly requestId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly requestedBy: StableIdentifierV1;
  readonly requestedAt: StrictUtcTimestampV1;
  readonly state: ArtifactDeletionStateV1;
  readonly blockers: readonly string[];
  readonly authorizedAt?: StrictUtcTimestampV1;
  readonly revision: number;
}

export type ArtifactRetentionErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_STATE'
  | 'INVALID_REVISION'
  | 'CROSS_SCOPE'
  | 'RETENTION_BLOCKED'
  | 'MFA_REQUIRED';

export type ArtifactRetentionResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ArtifactRetentionErrorCodeV1 };

function accepted<TValue>(value: TValue): ArtifactRetentionResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: ArtifactRetentionErrorCodeV1): ArtifactRetentionResultV1<never> {
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

export function createArtifactDeletionRequestV1(input: {
  readonly requestId: unknown;
  readonly artifactVersionId: unknown;
  readonly tenantScope: unknown;
  readonly requestedBy: unknown;
  readonly requestedAt: unknown;
}): ArtifactRetentionResultV1<ArtifactDeletionRequestV1> {
  const requestId = identifier(input.requestId);
  const artifactVersionId = identifier(input.artifactVersionId);
  const tenantScope = parseTenantScopeV1(input.tenantScope);
  const requestedBy = identifier(input.requestedBy);
  const requestedAt = timestamp(input.requestedAt);
  if (!requestId || !artifactVersionId || !requestedBy) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope.accepted) return rejected('INVALID_SCOPE');
  if (!requestedAt) return rejected('INVALID_TIMESTAMP');
  return accepted(
    Object.freeze({
      schemaVersion: ARTIFACT_RETENTION_SCHEMA_VERSION_V1,
      requestId,
      artifactVersionId,
      tenantScope: tenantScope.value,
      requestedBy,
      requestedAt,
      state: 'REQUESTED' as const,
      blockers: Object.freeze([]),
      revision: 1,
    }),
  );
}

export function authorizeArtifactDeletionV1(
  request: ArtifactDeletionRequestV1,
  evaluation: ArtifactRetentionEvaluationV1,
  input: {
    readonly tenantScope: unknown;
    readonly approvedAt: unknown;
    readonly mfaSatisfied: unknown;
  },
): ArtifactRetentionResultV1<ArtifactDeletionRequestV1> {
  const tenantScope = parseTenantScopeV1(input.tenantScope);
  const approvedAt = timestamp(input.approvedAt);
  if (!tenantScope.accepted) return rejected('INVALID_SCOPE');
  if (!tenantScopesEqualV1(tenantScope.value, request.tenantScope)) return rejected('CROSS_SCOPE');
  if (!approvedAt || Date.parse(approvedAt) < Date.parse(request.requestedAt))
    return rejected('INVALID_TIMESTAMP');
  if (typeof input.mfaSatisfied !== 'boolean' || !input.mfaSatisfied)
    return rejected('MFA_REQUIRED');
  if (!evaluation.eligible) return rejected('RETENTION_BLOCKED');
  if (request.state !== 'REQUESTED' && request.state !== 'BLOCKED')
    return rejected('INVALID_STATE');
  return accepted(
    Object.freeze({
      ...request,
      state: 'AUTHORIZED' as const,
      blockers: Object.freeze([]),
      authorizedAt: approvedAt,
      revision: request.revision + 1,
    }),
  );
}

export function blockArtifactDeletionV1(
  request: ArtifactDeletionRequestV1,
  evaluation: ArtifactRetentionEvaluationV1,
): ArtifactRetentionResultV1<ArtifactDeletionRequestV1> {
  if (request.state !== 'REQUESTED' && request.state !== 'BLOCKED')
    return rejected('INVALID_STATE');
  return accepted(
    Object.freeze({
      ...request,
      state: 'BLOCKED' as const,
      blockers: Object.freeze([...evaluation.blockers]),
      revision: request.revision + (request.state === 'BLOCKED' ? 0 : 1),
    }),
  );
}
