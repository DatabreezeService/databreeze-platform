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

/** IAE-003, IAE-007, IAE-012, IAE-021: lineage and deletion authority. */
export const ARTIFACT_GOVERNANCE_SCHEMA_VERSION_V1 = 1 as const;

export type LineageTransformV1 = 'COPIED' | 'NORMALIZED' | 'AGGREGATED' | 'REDACTED';
export type RetentionBlockerV1 =
  | 'WORKSPACE_RETENTION'
  | 'RESOURCE_RETENTION'
  | 'AUDIT_RETENTION'
  | 'RECOVERY_WINDOW'
  | 'ACTIVE_APPROVAL'
  | 'LEGAL_HOLD';

export interface CoordinateLineageV1 {
  readonly sourceEvidenceId: StableIdentifierV1;
  readonly derivedEvidenceId: StableIdentifierV1;
  readonly transform: LineageTransformV1;
}

export interface ArtifactLineageV1 {
  readonly schemaVersion: typeof ARTIFACT_GOVERNANCE_SCHEMA_VERSION_V1;
  readonly lineageId: StableIdentifierV1;
  readonly derivedArtifactVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly sourceArtifactVersionIds: readonly StableIdentifierV1[];
  readonly processorVersion: string;
  readonly recipeVersion?: string;
  readonly coordinateLineage: readonly CoordinateLineageV1[];
}

export interface ArtifactRetentionEvaluationV1 {
  readonly eligible: boolean;
  readonly blockers: readonly RetentionBlockerV1[];
  readonly evaluatedAt: StrictUtcTimestampV1;
}

export type ArtifactGovernanceErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'CROSS_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TEXT'
  | 'INVALID_HASH'
  | 'INVALID_LINEAGE'
  | 'DUPLICATE_IDENTIFIER'
  | 'INVALID_TRANSFORM'
  | 'SOURCE_REQUIRED'
  | 'SOURCE_NOT_ACTIVE'
  | 'DATA_MODE_WIDENING';

export type ArtifactGovernanceResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ArtifactGovernanceErrorCodeV1 };

function accepted<TValue>(value: TValue): ArtifactGovernanceResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: ArtifactGovernanceErrorCodeV1): ArtifactGovernanceResultV1<never> {
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

export function createArtifactLineageV1(input: {
  readonly lineageId: unknown;
  readonly derivedArtifactVersionId: unknown;
  readonly tenantScope: unknown;
  readonly sourceArtifactVersionIds: unknown;
  readonly processorVersion: unknown;
  readonly recipeVersion?: unknown;
  readonly coordinateLineage: unknown;
  readonly sourceTenantScopes?: unknown;
}): ArtifactGovernanceResultV1<ArtifactLineageV1> {
  const lineageId = identifier(input.lineageId);
  const derivedArtifactVersionId = identifier(input.derivedArtifactVersionId);
  const tenantScope = scope(input.tenantScope);
  const processorVersion = text(input.processorVersion, 128);
  const recipeVersion =
    input.recipeVersion === undefined ? undefined : text(input.recipeVersion, 128);
  if (!lineageId || !derivedArtifactVersionId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!processorVersion || (input.recipeVersion !== undefined && !recipeVersion))
    return rejected('INVALID_TEXT');
  if (!Array.isArray(input.sourceArtifactVersionIds) || input.sourceArtifactVersionIds.length === 0)
    return rejected('INVALID_LINEAGE');
  const sourceArtifactVersionIds = input.sourceArtifactVersionIds.map(identifier);
  if (sourceArtifactVersionIds.some((candidate): candidate is undefined => candidate === undefined))
    return rejected('INVALID_IDENTIFIER');
  if (new Set(sourceArtifactVersionIds).size !== sourceArtifactVersionIds.length)
    return rejected('DUPLICATE_IDENTIFIER');
  if (input.sourceTenantScopes !== undefined) {
    if (!Array.isArray(input.sourceTenantScopes)) return rejected('INVALID_SCOPE');
    for (const candidate of input.sourceTenantScopes) {
      const sourceScope = scope(candidate);
      if (!sourceScope || !tenantScopesEqualV1(sourceScope, tenantScope))
        return rejected('CROSS_SCOPE');
    }
  }
  if (!Array.isArray(input.coordinateLineage)) return rejected('INVALID_LINEAGE');
  const coordinateLineage: CoordinateLineageV1[] = [];
  for (const candidate of input.coordinateLineage) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
      return rejected('INVALID_LINEAGE');
    const record = candidate as Record<string, unknown>;
    const sourceEvidenceId = identifier(record['sourceEvidenceId']);
    const derivedEvidenceId = identifier(record['derivedEvidenceId']);
    const transform = record['transform'];
    if (!sourceEvidenceId || !derivedEvidenceId) return rejected('INVALID_IDENTIFIER');
    if (!['COPIED', 'NORMALIZED', 'AGGREGATED', 'REDACTED'].includes(transform as string))
      return rejected('INVALID_TRANSFORM');
    coordinateLineage.push(
      Object.freeze({
        sourceEvidenceId,
        derivedEvidenceId,
        transform: transform as LineageTransformV1,
      }),
    );
  }
  return accepted(
    Object.freeze({
      schemaVersion: ARTIFACT_GOVERNANCE_SCHEMA_VERSION_V1,
      lineageId,
      derivedArtifactVersionId,
      tenantScope,
      sourceArtifactVersionIds: Object.freeze(sourceArtifactVersionIds as StableIdentifierV1[]),
      processorVersion,
      ...(recipeVersion ? { recipeVersion } : {}),
      coordinateLineage: Object.freeze(coordinateLineage),
    }),
  );
}

/** IAE-007, IAE-008: derived content cannot cross scope or widen a data mode. */
export function validateDerivedArtifactVersionV1(input: {
  readonly derived: ArtifactVersionV1;
  readonly sourceVersions: readonly ArtifactVersionV1[];
}): ArtifactGovernanceResultV1<true> {
  if (input.sourceVersions.length === 0) return rejected('SOURCE_REQUIRED');
  const sourceIds = new Set<string>();
  const sourceModeRanks: number[] = [];
  for (const source of input.sourceVersions) {
    if (source.versionId === input.derived.versionId) return rejected('DUPLICATE_IDENTIFIER');
    if (sourceIds.has(source.versionId)) return rejected('DUPLICATE_IDENTIFIER');
    sourceIds.add(source.versionId);
    if (!tenantScopesEqualV1(source.tenantScope, input.derived.tenantScope))
      return rejected('CROSS_SCOPE');
    if (source.status !== 'ACTIVE') return rejected('SOURCE_NOT_ACTIVE');
    sourceModeRanks.push(source.dataMode === 'Local' ? 0 : source.dataMode === 'Hybrid' ? 1 : 2);
  }
  const derivedModeRank =
    input.derived.dataMode === 'Local' ? 0 : input.derived.dataMode === 'Hybrid' ? 1 : 2;
  const leastPermissiveSource = Math.min(...sourceModeRanks);
  return derivedModeRank <= leastPermissiveSource ? accepted(true) : rejected('DATA_MODE_WIDENING');
}

export function evaluateArtifactRetentionV1(input: {
  readonly evaluatedAt: unknown;
  readonly workspaceRetentionUntil: unknown;
  readonly resourceRetentionUntil: unknown;
  readonly auditRetentionUntil: unknown;
  readonly recoveryWindowUntil: unknown;
  readonly activeApproval: boolean;
  readonly legalHold: boolean;
}): ArtifactGovernanceResultV1<ArtifactRetentionEvaluationV1> {
  const evaluatedAt = timestamp(input.evaluatedAt);
  const workspaceRetentionUntil = timestamp(input.workspaceRetentionUntil);
  const resourceRetentionUntil = timestamp(input.resourceRetentionUntil);
  const auditRetentionUntil = timestamp(input.auditRetentionUntil);
  const recoveryWindowUntil = timestamp(input.recoveryWindowUntil);
  if (
    !evaluatedAt ||
    !workspaceRetentionUntil ||
    !resourceRetentionUntil ||
    !auditRetentionUntil ||
    !recoveryWindowUntil
  )
    return rejected('INVALID_TIMESTAMP');
  if (typeof input.activeApproval !== 'boolean' || typeof input.legalHold !== 'boolean')
    return rejected('INVALID_LINEAGE');
  const now = Date.parse(evaluatedAt);
  const blockers: RetentionBlockerV1[] = [];
  if (now < Date.parse(workspaceRetentionUntil)) blockers.push('WORKSPACE_RETENTION');
  if (now < Date.parse(resourceRetentionUntil)) blockers.push('RESOURCE_RETENTION');
  if (now < Date.parse(auditRetentionUntil)) blockers.push('AUDIT_RETENTION');
  if (now < Date.parse(recoveryWindowUntil)) blockers.push('RECOVERY_WINDOW');
  if (input.activeApproval) blockers.push('ACTIVE_APPROVAL');
  if (input.legalHold) blockers.push('LEGAL_HOLD');
  return accepted(
    Object.freeze({
      eligible: blockers.length === 0,
      blockers: Object.freeze(blockers),
      evaluatedAt,
    }),
  );
}
