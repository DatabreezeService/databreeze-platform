import { createHash } from 'node:crypto';
import type { DdaDashboardAuthoringCommandResult } from '@databreeze/contracts/v3';

import {
  computeDashboardSnapshotHashV1,
  createDdaMaterializationV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import type {
  DashboardSnapshotV1,
  DashboardVersionV1,
  DdaMaterializationV1,
  DdaAudienceV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { parseStableIdentifierV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import { buildMaterializationCacheKeyV1 } from '../../refresh/application/materialization-cache-key.js';
import type { DashboardPublicationApprovalInvalidationInstructionV1 } from './dashboard-publication-approval.port.js';
import type { DashboardPublicationAuditOutboxMetadataV1 } from './dashboard-publication-audit-outbox.port.js';
import type { DashboardPublicationMaterializationBindingProofV1 } from './dashboard-publication-materialization.port.js';

export type DashboardPublicationAudienceV1 = Exclude<DdaAudienceV1, 'SHARED_LINK'>;

export interface DashboardPublicationResolvedProjectionV1 {
  readonly materializations: readonly DdaMaterializationV1[];
  readonly bindingProof: readonly DashboardPublicationMaterializationBindingProofV1[];
  readonly freshnessState: 'FRESH' | 'STALE' | 'PENDING' | 'BLOCKED' | 'SOURCE_UNAVAILABLE';
  readonly evidenceState: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
}

function canonicalJson(value: unknown): string {
  if (value === undefined) throw new Error('DDA_PUBLICATION_CANONICAL_INVALID');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('DDA_PUBLICATION_CANONICAL_INVALID');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new Error('DDA_PUBLICATION_CANONICAL_INVALID');
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function sameScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  if (left.scopeType !== right.scopeType || left.organizationId !== right.organizationId)
    return false;
  if ('workspaceId' in left || 'workspaceId' in right) {
    if (
      !('workspaceId' in left) ||
      !('workspaceId' in right) ||
      left.workspaceId !== right.workspaceId
    ) {
      return false;
    }
  }
  if ('projectId' in left || 'projectId' in right) {
    if (!('projectId' in left) || !('projectId' in right) || left.projectId !== right.projectId) {
      return false;
    }
  }
  return true;
}

function matchesVersionBinding(
  version: DashboardVersionV1,
  materialization: DdaMaterializationV1,
): boolean {
  const widget = version.widgets.find(
    (candidate) => candidate.widgetId === materialization.widgetId,
  );
  if (
    widget === undefined ||
    materialization.analysisPlanVersionId !== widget.binding.analysisPlanVersionId ||
    materialization.locale !== version.locale ||
    materialization.timezone !== version.timezone
  ) {
    return false;
  }
  return version.datasetBindings.some(
    (binding) =>
      binding.datasetVersionId === materialization.datasetVersionId &&
      binding.semanticVersionId === materialization.semanticVersionId &&
      binding.metricVersionId === materialization.metricVersionId,
  );
}

/**
 * Rebuild the canonical cache identity from the verified materialization row
 * and the exact dashboard-version binding. A resolver-supplied hash is only
 * accepted when it agrees with this server-owned calculation.
 */
export function buildDashboardPublicationMaterializationBindingProofV1(input: {
  readonly tenantScope: TenantScopeV1;
  readonly version: DashboardVersionV1;
  readonly materialization: DdaMaterializationV1;
}): DashboardPublicationMaterializationBindingProofV1 | undefined {
  const widget = input.version.widgets.find(
    (candidate) => candidate.widgetId === input.materialization.widgetId,
  );
  if (widget === undefined) return undefined;
  const cacheKey = buildMaterializationCacheKeyV1({
    tenantScope: input.tenantScope,
    dashboardVersionId: input.version.versionId,
    widgetId: input.materialization.widgetId,
    analysisPlanVersionId: input.materialization.analysisPlanVersionId,
    datasetVersionId: input.materialization.datasetVersionId,
    semanticVersionId: input.materialization.semanticVersionId,
    metricVersionId: input.materialization.metricVersionId,
    permissionProjectionVersionId: input.materialization.permissionProjectionVersionId,
    parameterHash: input.materialization.parameterHash,
    locale: input.materialization.locale,
    timezone: input.materialization.timezone,
    engineVersion: input.materialization.engineVersion,
    adapterVersion: input.materialization.adapterVersion,
    effectivePolicyVersionId: input.materialization.effectivePolicyVersionId,
  });
  if (
    !cacheKey.complete ||
    cacheKey.cacheIdentityHash !== input.materialization.cacheIdentityHash
  ) {
    return undefined;
  }
  return Object.freeze({
    schemaVersion: input.materialization.schemaVersion,
    materializationId: input.materialization.materializationId,
    tenantScope: input.materialization.tenantScope,
    dashboardVersionId: input.materialization.dashboardVersionId,
    widgetId: input.materialization.widgetId,
    analysisPlanVersionId: input.materialization.analysisPlanVersionId,
    datasetVersionId: input.materialization.datasetVersionId,
    semanticVersionId: input.materialization.semanticVersionId,
    metricVersionId: input.materialization.metricVersionId,
    materializationDefinitionId: widget.binding.materializationDefinitionId,
    resultManifestId: input.materialization.resultManifestId,
    permissionProjectionVersionId: input.materialization.permissionProjectionVersionId,
    parameterHash: input.materialization.parameterHash,
    locale: input.materialization.locale,
    timezone: input.materialization.timezone,
    engineVersion: input.materialization.engineVersion,
    adapterVersion: input.materialization.adapterVersion,
    effectivePolicyVersionId: input.materialization.effectivePolicyVersionId,
    cacheIdentityHash: cacheKey.cacheIdentityHash,
    materializationCreatedAt: input.materialization.createdAt,
  });
}

/**
 * Publication integrity extends the domain snapshot hash with the complete,
 * server-derived immutable materialization binding proof. Sorting here makes
 * resolver order irrelevant while preserving every value-affecting field.
 */
export function computeDashboardPublicationCanonicalHashV1(input: {
  readonly snapshot: DashboardSnapshotV1;
  readonly bindingProof: readonly DashboardPublicationMaterializationBindingProofV1[];
}): string {
  const baseHash = computeDashboardSnapshotHashV1(input.snapshot);
  const bindingProof = [...input.bindingProof].sort((left, right) =>
    left.materializationId.localeCompare(right.materializationId),
  );
  return createHash('sha256')
    .update(canonicalJson({ baseHash, bindingProof }), 'utf8')
    .digest('hex');
}

export type DashboardSnapshotWithBindingProofV1 = DashboardSnapshotV1 & {
  readonly bindingProof: readonly DashboardPublicationMaterializationBindingProofV1[];
  readonly bindingProofVersion: 1;
};

const BINDING_PROOF_KEYS = new Set([
  'schemaVersion',
  'materializationId',
  'tenantScope',
  'dashboardVersionId',
  'widgetId',
  'analysisPlanVersionId',
  'datasetVersionId',
  'semanticVersionId',
  'metricVersionId',
  'materializationDefinitionId',
  'resultManifestId',
  'permissionProjectionVersionId',
  'parameterHash',
  'locale',
  'timezone',
  'engineVersion',
  'adapterVersion',
  'effectivePolicyVersionId',
  'cacheIdentityHash',
  'materializationCreatedAt',
]);

/** Validates the immutable proof envelope used by every durable snapshot writer. */
export function validateDashboardSnapshotBindingProofV1(input: {
  readonly snapshot: DashboardSnapshotV1;
  readonly bindingProof: unknown;
}): readonly DashboardPublicationMaterializationBindingProofV1[] | undefined {
  if (!Array.isArray(input.bindingProof) || input.bindingProof.length === 0) return undefined;
  if (
    input.snapshot.inputSelectorHash !==
    computeDashboardPublicationInputSelectorHashV1(
      input.snapshot.dashboardVersionId,
      input.snapshot.materializationIds,
    )
  ) {
    return undefined;
  }
  const materializationIds = new Set(input.snapshot.materializationIds);
  if (materializationIds.size !== input.snapshot.materializationIds.length) return undefined;
  const seen = new Set<string>();
  const normalized: DashboardPublicationMaterializationBindingProofV1[] = [];
  for (const candidate of input.bindingProof) {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return undefined;
    }
    const proof = candidate as Record<string, unknown>;
    if (
      Object.keys(proof).length !== BINDING_PROOF_KEYS.size ||
      Object.keys(proof).some((key) => !BINDING_PROOF_KEYS.has(key)) ||
      proof['schemaVersion'] !== 1 ||
      typeof proof['materializationDefinitionId'] !== 'string' ||
      !parseStableIdentifierV1(proof['materializationDefinitionId']).accepted
    ) {
      return undefined;
    }
    const parsed = createDdaMaterializationV1({
      materializationId: proof['materializationId'],
      tenantScope: proof['tenantScope'],
      dashboardVersionId: proof['dashboardVersionId'],
      widgetId: proof['widgetId'],
      analysisPlanVersionId: proof['analysisPlanVersionId'],
      datasetVersionId: proof['datasetVersionId'],
      semanticVersionId: proof['semanticVersionId'],
      metricVersionId: proof['metricVersionId'],
      permissionProjectionVersionId: proof['permissionProjectionVersionId'],
      parameterHash: proof['parameterHash'],
      locale: proof['locale'],
      timezone: proof['timezone'],
      engineVersion: proof['engineVersion'],
      adapterVersion: proof['adapterVersion'],
      effectivePolicyVersionId: proof['effectivePolicyVersionId'],
      resultManifestId: proof['resultManifestId'],
      cacheIdentityHash: proof['cacheIdentityHash'],
      createdAt: proof['materializationCreatedAt'],
    });
    if (!parsed.accepted) return undefined;
    const materialization = parsed.value;
    if (
      !sameScope(input.snapshot.tenantScope, materialization.tenantScope) ||
      materialization.dashboardVersionId !== input.snapshot.dashboardVersionId ||
      materialization.permissionProjectionVersionId !==
        input.snapshot.permissionProjectionVersionId ||
      !materializationIds.has(materialization.materializationId) ||
      seen.has(materialization.materializationId)
    ) {
      return undefined;
    }
    const cacheKey = buildMaterializationCacheKeyV1({
      tenantScope: input.snapshot.tenantScope,
      dashboardVersionId: materialization.dashboardVersionId,
      widgetId: materialization.widgetId,
      analysisPlanVersionId: materialization.analysisPlanVersionId,
      datasetVersionId: materialization.datasetVersionId,
      semanticVersionId: materialization.semanticVersionId,
      metricVersionId: materialization.metricVersionId,
      permissionProjectionVersionId: materialization.permissionProjectionVersionId,
      parameterHash: materialization.parameterHash,
      locale: materialization.locale,
      timezone: materialization.timezone,
      engineVersion: materialization.engineVersion,
      adapterVersion: materialization.adapterVersion,
      effectivePolicyVersionId: materialization.effectivePolicyVersionId,
    });
    if (!cacheKey.complete || cacheKey.cacheIdentityHash !== materialization.cacheIdentityHash) {
      return undefined;
    }
    const normalizedProof = Object.freeze({
      ...proof,
      schemaVersion: 1 as const,
      materializationId: materialization.materializationId,
      tenantScope: materialization.tenantScope,
      dashboardVersionId: materialization.dashboardVersionId,
      widgetId: materialization.widgetId,
      analysisPlanVersionId: materialization.analysisPlanVersionId,
      datasetVersionId: materialization.datasetVersionId,
      semanticVersionId: materialization.semanticVersionId,
      metricVersionId: materialization.metricVersionId,
      resultManifestId: materialization.resultManifestId,
      permissionProjectionVersionId: materialization.permissionProjectionVersionId,
      parameterHash: materialization.parameterHash,
      locale: materialization.locale,
      timezone: materialization.timezone,
      engineVersion: materialization.engineVersion,
      adapterVersion: materialization.adapterVersion,
      effectivePolicyVersionId: materialization.effectivePolicyVersionId,
      cacheIdentityHash: cacheKey.cacheIdentityHash,
      materializationCreatedAt: materialization.createdAt,
    }) as DashboardPublicationMaterializationBindingProofV1;
    if (canonicalJson(normalizedProof) !== canonicalJson(proof)) return undefined;
    seen.add(materialization.materializationId);
    normalized.push(normalizedProof);
  }
  if (seen.size !== materializationIds.size) return undefined;
  normalized.sort((left, right) => left.materializationId.localeCompare(right.materializationId));
  if (
    computeDashboardPublicationCanonicalHashV1({
      snapshot: input.snapshot,
      bindingProof: normalized,
    }) !== input.snapshot.canonicalHash
  ) {
    return undefined;
  }
  return Object.freeze(normalized);
}

export function attachDashboardSnapshotBindingProofV1(
  snapshot: DashboardSnapshotV1,
  bindingProof: readonly DashboardPublicationMaterializationBindingProofV1[],
): DashboardSnapshotWithBindingProofV1 {
  const validated = validateDashboardSnapshotBindingProofV1({ snapshot, bindingProof });
  if (validated === undefined) throw new Error('DDA_SNAPSHOT_BINDING_PROOF_INVALID');
  return Object.freeze({ ...snapshot, bindingProof: validated, bindingProofVersion: 1 });
}

export function readDashboardSnapshotBindingProofV1(
  snapshot: DashboardSnapshotV1,
): readonly DashboardPublicationMaterializationBindingProofV1[] | undefined {
  const candidate = snapshot as DashboardSnapshotV1 & {
    readonly bindingProof?: unknown;
    readonly bindingProofVersion?: unknown;
  };
  if (candidate.bindingProofVersion !== 1 || !Array.isArray(candidate.bindingProof)) {
    return undefined;
  }
  return candidate.bindingProof as readonly DashboardPublicationMaterializationBindingProofV1[];
}

/** Defense-in-depth validation for the repository boundary; callers cannot supply raw IDs. */
export function validateDashboardPublicationResolvedProjectionV1(input: {
  readonly tenantScope: TenantScopeV1;
  readonly version: DashboardVersionV1;
  readonly projection: DashboardPublicationResolvedProjectionV1;
}):
  | { readonly accepted: true; readonly value: DashboardPublicationResolvedProjectionV1 }
  | { readonly accepted: false } {
  if (
    !Array.isArray(input.projection.materializations) ||
    !Array.isArray(input.projection.bindingProof) ||
    !['FRESH', 'STALE', 'PENDING', 'BLOCKED', 'SOURCE_UNAVAILABLE'].includes(
      input.projection.freshnessState,
    ) ||
    !['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'].includes(input.projection.evidenceState) ||
    input.projection.materializations.length === 0 ||
    input.projection.materializations.length !== input.version.widgets.length
  ) {
    return { accepted: false };
  }
  const widgets = new Set(input.version.widgets.map((widget) => widget.widgetId));
  const materializationIds = new Set<string>();
  const widgetIds = new Set<string>();
  const materializations: DdaMaterializationV1[] = [];
  for (const candidate of input.projection.materializations) {
    const parsed = createDdaMaterializationV1(
      candidate as unknown as Parameters<typeof createDdaMaterializationV1>[0],
    );
    if (!parsed.accepted) return { accepted: false };
    const materialization = parsed.value;
    if (
      !sameScope(input.tenantScope, materialization.tenantScope) ||
      materialization.dashboardVersionId !== input.version.versionId ||
      !widgets.has(materialization.widgetId) ||
      !matchesVersionBinding(input.version, materialization) ||
      materializationIds.has(materialization.materializationId) ||
      widgetIds.has(materialization.widgetId)
    ) {
      return { accepted: false };
    }
    materializationIds.add(materialization.materializationId);
    widgetIds.add(materialization.widgetId);
    materializations.push(materialization);
  }
  if (widgetIds.size !== widgets.size) return { accepted: false };
  if (input.projection.bindingProof.length !== materializations.length) {
    return { accepted: false };
  }
  const proofs = new Map<string, DashboardPublicationMaterializationBindingProofV1>();
  for (const candidate of input.projection.bindingProof) {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return { accepted: false };
    }
    const proof = candidate as DashboardPublicationMaterializationBindingProofV1;
    if (
      typeof proof.schemaVersion !== 'number' ||
      typeof proof.materializationId !== 'string' ||
      proof.tenantScope === null ||
      typeof proof.tenantScope !== 'object' ||
      typeof proof.dashboardVersionId !== 'string' ||
      typeof proof.widgetId !== 'string' ||
      typeof proof.analysisPlanVersionId !== 'string' ||
      typeof proof.datasetVersionId !== 'string' ||
      typeof proof.semanticVersionId !== 'string' ||
      typeof proof.metricVersionId !== 'string' ||
      typeof proof.materializationDefinitionId !== 'string' ||
      typeof proof.resultManifestId !== 'string' ||
      typeof proof.permissionProjectionVersionId !== 'string' ||
      typeof proof.parameterHash !== 'string' ||
      typeof proof.locale !== 'string' ||
      typeof proof.timezone !== 'string' ||
      typeof proof.engineVersion !== 'string' ||
      typeof proof.adapterVersion !== 'string' ||
      typeof proof.effectivePolicyVersionId !== 'string' ||
      typeof proof.cacheIdentityHash !== 'string' ||
      typeof proof.materializationCreatedAt !== 'string' ||
      proofs.has(proof.materializationId)
    ) {
      return { accepted: false };
    }
    proofs.set(proof.materializationId, proof);
  }
  for (const materialization of materializations) {
    const proof = proofs.get(materialization.materializationId);
    const expectedProof = buildDashboardPublicationMaterializationBindingProofV1({
      tenantScope: input.tenantScope,
      version: input.version,
      materialization,
    });
    if (proof === undefined || expectedProof === undefined) {
      return { accepted: false };
    }
    try {
      if (canonicalJson(proof) !== canonicalJson(expectedProof)) return { accepted: false };
    } catch {
      return { accepted: false };
    }
  }
  materializations.sort((left, right) =>
    left.materializationId.localeCompare(right.materializationId),
  );
  const permissionProjectionIds = new Set(
    materializations.map((materialization) => materialization.permissionProjectionVersionId),
  );
  if (permissionProjectionIds.size !== 1) return { accepted: false };
  return {
    accepted: true,
    value: Object.freeze({
      materializations: Object.freeze(materializations),
      bindingProof: Object.freeze(
        materializations.map(
          (materialization) =>
            buildDashboardPublicationMaterializationBindingProofV1({
              tenantScope: input.tenantScope,
              version: input.version,
              materialization,
            })!,
        ),
      ),
      freshnessState: input.projection.freshnessState,
      evidenceState: input.projection.evidenceState,
    }),
  };
}

export interface DashboardPublicationCommitInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly versionId: string;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly audience: DashboardPublicationAudienceV1;
  readonly resolvedProjection: DashboardPublicationResolvedProjectionV1;
  readonly auditMetadata: DashboardPublicationAuditOutboxMetadataV1;
  readonly approvalInvalidation?: DashboardPublicationApprovalInvalidationInstructionV1;
}

export type DashboardPublicationReplayPreflightResultV1 =
  | {
      readonly kind: 'MISS';
    }
  | {
      readonly kind: 'REPLAY';
      readonly snapshot: DashboardSnapshotV1;
      readonly revision: number;
    }
  | {
      readonly kind: 'CONFLICT';
    }
  | {
      readonly kind: 'INVALID';
    };

export type DashboardPublicationCommitResultV1 =
  | {
      readonly accepted: true;
      readonly snapshot: DashboardSnapshotV1;
      readonly replayed: boolean;
      readonly revision: number;
    }
  | {
      readonly accepted: false;
      readonly code:
        | 'VERSION_NOT_FOUND'
        | 'REVISION_CONFLICT'
        | 'IDEMPOTENCY_CONFLICT'
        | 'INVALID_SNAPSHOT';
    };

export function computeDashboardPublicationInputSelectorHashV1(
  versionId: string,
  materializationIds: readonly string[],
): string {
  const normalized = [...new Set(materializationIds)].sort();
  return createHash('sha256')
    .update(JSON.stringify({ versionId, mats: normalized }))
    .digest('hex');
}

export function computeDashboardPublicationRequestHashV1(
  input: DashboardPublicationCommitInputV1,
): string {
  // Only stable command semantics participate in idempotency. Resolved
  // materializations and approvals are mutable server state; a successful key
  // must replay its original snapshot after those inputs refresh or expire.
  return createHash('sha256')
    .update(
      JSON.stringify({
        dashboardId: input.dashboardId,
        versionId: input.versionId,
        expectedRevision: input.expectedRevision,
        audience: input.audience,
      }),
    )
    .digest('hex');
}

export type DashboardAuthoringCommandResultV1 = DdaDashboardAuthoringCommandResult;

export interface DashboardAuthoringCommitInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly expectedRevision: number;
  readonly identity: DashboardDraftIdentityV1;
  readonly version: DashboardVersionV1;
  readonly commandResult: DashboardAuthoringCommandResultV1;
  readonly removedWidget?: {
    readonly dashboardId: string;
    readonly widgetId: string;
    readonly widget: DashboardVersionV1['widgets'][number];
  };
}

export interface DashboardDraftIdentityV1 {
  readonly dashboardId: string;
  readonly tenantScope: TenantScopeV1;
  readonly title: { readonly vi: string; readonly en: string };
  readonly status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  readonly draftVersionId?: string;
  readonly publishedVersionId?: string;
  readonly revision: number;
}

export interface DashboardDraftRepositoryPortV1 {
  saveIdentity(identity: DashboardDraftIdentityV1): Promise<void>;
  findIdentity(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardDraftIdentityV1 | undefined>;
  saveVersion(version: DashboardVersionV1): Promise<void>;
  findVersion(
    tenantScope: TenantScopeV1,
    versionId: string,
  ): Promise<DashboardVersionV1 | undefined>;
  saveRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
    readonly widget: DashboardVersionV1['widgets'][number];
  }): Promise<void>;
  findRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
  }): Promise<DashboardVersionV1['widgets'][number] | undefined>;
  findCommandResult(
    tenantScope: TenantScopeV1,
    commandId: string,
  ): Promise<DashboardAuthoringCommandResultV1 | undefined>;
  commitAuthoringVersion(
    input: DashboardAuthoringCommitInputV1,
  ): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly code: 'REVISION_CONFLICT' | 'COMMAND_CONFLICT' }
  >;
  /** Optional on authoring-only test doubles; production draft adapters implement it. */
  findPublicationReplay?(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly versionId: string;
    readonly expectedRevision: number;
    readonly idempotencyKey: string;
    readonly audience: DashboardPublicationAudienceV1;
  }): Promise<DashboardPublicationReplayPreflightResultV1>;
  /** Optional on authoring-only test doubles; production draft adapters implement it. */
  commitPublication?(
    input: DashboardPublicationCommitInputV1,
  ): Promise<DashboardPublicationCommitResultV1>;
}
