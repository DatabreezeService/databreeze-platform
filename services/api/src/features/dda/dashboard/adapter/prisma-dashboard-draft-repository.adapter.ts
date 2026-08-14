import {
  computeDashboardSnapshotHashV1,
  createDdaMaterializationV1,
  createDashboardSnapshotV1,
  type DashboardSnapshotV1,
  type DashboardVersionV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { randomUUID } from 'node:crypto';
import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  computeDashboardPublicationCanonicalHashV1,
  computeDashboardPublicationInputSelectorHashV1,
  computeDashboardPublicationRequestHashV1,
  attachDashboardSnapshotBindingProofV1,
  buildDashboardPublicationMaterializationBindingProofV1,
  validateDashboardPublicationResolvedProjectionV1,
} from '../application/dashboard-repository.port.js';
import type {
  DashboardAuthoringCommandResultV1,
  DashboardAuthoringCommitInputV1,
  DashboardDraftIdentityV1,
  DashboardDraftRepositoryPortV1,
  DashboardPublicationCommitInputV1,
  DashboardPublicationCommitResultV1,
  DashboardPublicationReplayPreflightResultV1,
} from '../application/dashboard-repository.port.js';
import type {
  DashboardPublicationApprovalInvalidationOutboxPortV1,
  DashboardPublicationApprovalInvalidationOutboxRecordV1,
} from '../application/dashboard-publication-approval-invalidation-outbox.port.js';
import type { DashboardPublicationMaterializationBindingProofV1 } from '../application/dashboard-publication-materialization.port.js';

export interface DashboardDraftRecordRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly titleVi: string;
  readonly titleEn: string;
  readonly status: string;
  readonly draftVersionId: string | null;
  readonly publishedVersionId: string | null;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DashboardDraftRecordCreateV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly titleVi: string;
  readonly titleEn: string;
  readonly status: string;
  readonly draftVersionId: string | null;
  readonly publishedVersionId: string | null;
  readonly revision: number;
}

export interface DashboardRemovedWidgetRowV1 {
  readonly dashboardId: string;
  readonly widgetId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly widgetDocument: unknown;
}

export interface DashboardSnapshotRecordRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly dashboardVersionId: string;
  readonly materializationIds: unknown;
  readonly bindingProof: unknown;
  readonly bindingProofVersion: number | null;
  readonly inputSelectorHash: string | null;
  readonly permissionProjectionVersionId: string;
  readonly audience: string;
  readonly freshnessState: string;
  readonly evidenceState: string;
  readonly evidenceReferenceId: string | null;
  readonly canonicalHash: string;
  readonly createdAt: Date;
}

export interface DashboardPublicationIdempotencyRowV1 {
  readonly keyValue: string;
  readonly snapshotId: string;
  readonly dashboardId: string;
  readonly versionId: string;
  readonly requestHash: string;
  readonly revision: number;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly createdAt: Date;
}

export interface DashboardRefreshStateRecordRowV1 {
  readonly id: string;
  readonly dashboardId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly freshnessPolicy: string;
  readonly lastSnapshotId: string | null;
  readonly lastJobId: string | null;
  readonly status: string;
  readonly reasonCode: string | null;
  readonly updatedAt: Date;
}

export interface DashboardPublicationAuditOutboxRecordRowV1 {
  readonly id: string;
  readonly keyValue: string;
  readonly dashboardId: string;
  readonly versionId: string;
  readonly snapshotId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly authorizationEpoch: number;
  readonly approvalId: string | null;
  readonly priorPublishedVersionId: string | null;
  readonly audience: string;
  readonly action: string;
  readonly createdAt: Date;
}

export interface DashboardPublicationApprovalInvalidationOutboxRecordRowV1 {
  readonly id: string;
  readonly keyValue: string;
  readonly snapshotId: string;
  readonly dashboardId: string;
  readonly priorPublishedVersionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly action: string;
  readonly state: string;
  readonly attempts: number;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: Date | null;
  readonly nextAttemptAt: Date | null;
  readonly lastError: string | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
}

export interface DashboardAuthoringCommandRowV1 {
  readonly commandId: string;
  readonly dashboardId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly versionId: string;
  readonly revision: number;
  readonly savedAt: Date;
  readonly publishes: boolean;
  readonly resultDocument: unknown;
}

export interface DdaDashboardDraftDatabaseClientV1 {
  readonly dashboardRecord: {
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: DashboardDraftRecordCreateV1;
      readonly update: Omit<DashboardDraftRecordCreateV1, 'id'>;
    }): Promise<DashboardDraftRecordRowV1>;
    findFirst(input: {
      readonly where: {
        readonly id: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<DashboardDraftRecordRowV1 | null>;
    updateMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<{ readonly count: number }>;
  };
  readonly dashboardVersionRecord: {
    create(input: { readonly data: Record<string, unknown> }): Promise<Record<string, unknown>>;
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: Record<string, unknown>;
      readonly update: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
    findFirst(input: {
      readonly where: {
        readonly id: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<Record<string, unknown> | null>;
  };
  readonly dashboardSnapshotRecord: {
    create(input: {
      readonly data: Record<string, unknown>;
    }): Promise<DashboardSnapshotRecordRowV1>;
    findFirst(input: {
      readonly where: {
        readonly id: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<DashboardSnapshotRecordRowV1 | null>;
  };
  readonly dashboardPublicationIdempotencyRecord: {
    create(input: {
      readonly data: Record<string, unknown>;
    }): Promise<DashboardPublicationIdempotencyRowV1>;
    findFirst(input: {
      readonly where: {
        readonly keyValue: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<DashboardPublicationIdempotencyRowV1 | null>;
  };
  readonly dashboardRefreshStateRecord: {
    upsert(input: {
      readonly where: {
        readonly organizationId_workspaceId_projectId_dashboardId: {
          readonly organizationId: string;
          readonly workspaceId: string;
          readonly projectId: string;
          readonly dashboardId: string;
        };
      };
      readonly create: Record<string, unknown>;
      readonly update: Record<string, unknown>;
    }): Promise<DashboardRefreshStateRecordRowV1>;
  };
  readonly dashboardPublicationAuditOutboxRecord: {
    create(input: {
      readonly data: Record<string, unknown>;
    }): Promise<DashboardPublicationAuditOutboxRecordRowV1>;
  };
  readonly dashboardPublicationApprovalInvalidationOutboxRecord: {
    create(input: {
      readonly data: Record<string, unknown>;
    }): Promise<DashboardPublicationApprovalInvalidationOutboxRecordRowV1>;
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: Readonly<Record<string, unknown>>;
    }): Promise<DashboardPublicationApprovalInvalidationOutboxRecordRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: Readonly<Record<string, unknown>>;
      readonly take?: number;
    }): Promise<readonly DashboardPublicationApprovalInvalidationOutboxRecordRowV1[]>;
    updateMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<{ readonly count: number }>;
  };
  readonly dashboardRemovedWidgetRecord: {
    upsert(input: {
      readonly where: {
        readonly dashboardId_widgetId: {
          readonly dashboardId: string;
          readonly widgetId: string;
        };
      };
      readonly create: DashboardRemovedWidgetRowV1;
      readonly update: Omit<DashboardRemovedWidgetRowV1, 'dashboardId' | 'widgetId'>;
    }): Promise<DashboardRemovedWidgetRowV1>;
    findFirst(input: {
      readonly where: {
        readonly dashboardId: string;
        readonly widgetId: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<DashboardRemovedWidgetRowV1 | null>;
  };
  readonly dashboardAuthoringCommandRecord: {
    create(input: {
      readonly data: Record<string, unknown>;
    }): Promise<DashboardAuthoringCommandRowV1>;
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
    }): Promise<DashboardAuthoringCommandRowV1 | null>;
  };
  readonly $transaction: <TValue>(
    callback: (client: DdaDashboardDraftDatabaseClientV1) => Promise<TValue>,
  ) => Promise<TValue>;
}

function requireProjectScope(tenantScope: TenantScopeV1): TenantScopeV1 & {
  readonly scopeType: 'project';
  readonly workspaceId: string;
  readonly projectId: string;
} {
  if (tenantScope.scopeType !== 'project' || !tenantScope.workspaceId || !tenantScope.projectId) {
    throw new Error('TENANT_SCOPE_REQUIRED');
  }
  return tenantScope;
}

function projectScopeKey(tenantScope: TenantScopeV1): string {
  const scope = requireProjectScope(tenantScope);
  return `${scope.organizationId}|${scope.workspaceId}|${scope.projectId}`;
}

function publicationTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, '.000Z');
}

function canonicalJson(value: unknown): string {
  if (value === undefined) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function createPublicationSnapshot(
  input: DashboardPublicationCommitInputV1,
  version: DashboardVersionV1,
): ReturnType<typeof createDashboardSnapshotV1> {
  const snapshotId = randomUUID();
  const createdAt = publicationTimestamp();
  const materializations = input.resolvedProjection.materializations;
  const materializationIds = materializations.map(
    (materialization) => materialization.materializationId,
  );
  const permissionProjectionVersionId = materializations[0]!.permissionProjectionVersionId;
  const inputSelectorHash = computeDashboardPublicationInputSelectorHashV1(
    version.versionId,
    materializationIds,
  );
  const baseCanonicalHash = computeDashboardSnapshotHashV1({
    snapshotId: snapshotId as never,
    tenantScope: input.tenantScope,
    dashboardVersionId: version.versionId,
    materializationIds: materializationIds as never,
    inputSelectorHash,
    permissionProjectionVersionId: permissionProjectionVersionId as never,
    audience: input.audience,
    freshnessState: input.resolvedProjection.freshnessState,
    evidenceState: input.resolvedProjection.evidenceState,
    createdAt: createdAt as never,
  });
  const created = createDashboardSnapshotV1({
    snapshotId,
    tenantScope: input.tenantScope,
    dashboardVersionId: version.versionId,
    materializationIds,
    inputSelectorHash,
    permissionProjectionVersionId,
    audience: input.audience,
    freshnessState: input.resolvedProjection.freshnessState,
    evidenceState: input.resolvedProjection.evidenceState,
    canonicalHash: baseCanonicalHash,
    createdAt,
    dashboardVersion: version,
    materializations,
  });
  if (!created.accepted) return created;
  const snapshot = Object.freeze({
    ...created.value,
    canonicalHash: computeDashboardPublicationCanonicalHashV1({
      snapshot: created.value,
      bindingProof: input.resolvedProjection.bindingProof,
    }),
  });
  return {
    accepted: true,
    value: attachDashboardSnapshotBindingProofV1(snapshot, input.resolvedProjection.bindingProof),
  };
}

function publicationMaterializationEnvelope(value: unknown): {
  readonly ids: unknown;
  readonly version?: unknown;
  readonly bindingProofVersion?: unknown;
  readonly inputSelectorHash?: unknown;
  readonly bindingProof?: unknown;
} {
  if (Array.isArray(value)) return { ids: value, version: 0, bindingProofVersion: 0 };
  if (value === null || typeof value !== 'object') {
    throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  }
  const envelope = value as Record<string, unknown>;
  if (!Array.isArray(envelope['ids'])) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  return {
    ids: envelope['ids'],
    ...(envelope['version'] === undefined ? {} : { version: envelope['version'] }),
    ...(envelope['bindingProofVersion'] === undefined
      ? {}
      : { bindingProofVersion: envelope['bindingProofVersion'] }),
    ...(envelope['inputSelectorHash'] === undefined
      ? {}
      : { inputSelectorHash: envelope['inputSelectorHash'] }),
    ...(envelope['bindingProof'] === undefined ? {} : { bindingProof: envelope['bindingProof'] }),
  };
}

function validatePersistedPublicationBindingProof(input: {
  readonly value: unknown;
  readonly materializationIds: readonly string[];
  readonly tenantScope: TenantScopeV1;
  readonly version: DashboardVersionV1;
  readonly permissionProjectionVersionId: string;
}): readonly DashboardPublicationMaterializationBindingProofV1[] {
  if (!Array.isArray(input.value) || input.value.length !== input.materializationIds.length) {
    throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  }
  const ids = new Set<string>();
  const normalized: DashboardPublicationMaterializationBindingProofV1[] = [];
  for (const candidate of input.value) {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
    }
    const proof = candidate as Record<string, unknown>;
    const materializationId = proof['materializationId'];
    if (
      typeof proof['schemaVersion'] !== 'number' ||
      typeof materializationId !== 'string' ||
      typeof proof['tenantScope'] !== 'object' ||
      proof['tenantScope'] === null ||
      typeof proof['dashboardVersionId'] !== 'string' ||
      typeof proof['widgetId'] !== 'string' ||
      typeof proof['analysisPlanVersionId'] !== 'string' ||
      typeof proof['datasetVersionId'] !== 'string' ||
      typeof proof['semanticVersionId'] !== 'string' ||
      typeof proof['metricVersionId'] !== 'string' ||
      typeof proof['materializationDefinitionId'] !== 'string' ||
      typeof proof['resultManifestId'] !== 'string' ||
      typeof proof['permissionProjectionVersionId'] !== 'string' ||
      typeof proof['parameterHash'] !== 'string' ||
      typeof proof['locale'] !== 'string' ||
      typeof proof['timezone'] !== 'string' ||
      typeof proof['engineVersion'] !== 'string' ||
      typeof proof['adapterVersion'] !== 'string' ||
      typeof proof['effectivePolicyVersionId'] !== 'string' ||
      typeof proof['cacheIdentityHash'] !== 'string' ||
      typeof proof['materializationCreatedAt'] !== 'string' ||
      ids.has(materializationId) ||
      !input.materializationIds.includes(materializationId) ||
      proof['permissionProjectionVersionId'] !== input.permissionProjectionVersionId
    ) {
      throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
    }
    const materialization = createDdaMaterializationV1({
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
    if (!materialization.accepted) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
    if (
      projectScopeKey(materialization.value.tenantScope) !== projectScopeKey(input.tenantScope) ||
      materialization.value.dashboardVersionId !== input.version.versionId
    ) {
      throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
    }
    const expected = buildDashboardPublicationMaterializationBindingProofV1({
      tenantScope: input.tenantScope,
      version: input.version,
      materialization: materialization.value,
    });
    if (expected === undefined || canonicalJson(expected) !== canonicalJson(proof)) {
      throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
    }
    normalized.push(expected);
    ids.add(materializationId);
  }
  return Object.freeze(
    normalized.sort((left, right) => left.materializationId.localeCompare(right.materializationId)),
  );
}

function reconstructPublicationSnapshot(
  row: DashboardSnapshotRecordRowV1,
  version: DashboardVersionV1,
): DashboardSnapshotV1 {
  const materializationEnvelope = publicationMaterializationEnvelope(row.materializationIds);
  const materializationIds = materializationEnvelope.ids as string[];
  const inputSelectorHash = row.inputSelectorHash ?? materializationEnvelope.inputSelectorHash;
  if (
    row.dashboardVersionId !== version.versionId ||
    typeof inputSelectorHash !== 'string' ||
    inputSelectorHash !==
      computeDashboardPublicationInputSelectorHashV1(version.versionId, materializationIds) ||
    (materializationEnvelope.inputSelectorHash !== undefined &&
      materializationEnvelope.inputSelectorHash !== inputSelectorHash) ||
    row.audience === 'SHARED_LINK'
  ) {
    throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  }
  const parsedScope = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsedScope.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  const proofVersion = row.bindingProofVersion;
  if (proofVersion !== 1 || materializationEnvelope.bindingProofVersion !== 1) {
    // Publication replay is never allowed to reconstruct a legacy proofless
    // snapshot. Legacy rows remain readable by non-publication tooling until an
    // explicit migration, but they cannot be returned as a publication result.
    throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  }
  let bindingProof: readonly DashboardPublicationMaterializationBindingProofV1[] = [];
  if (
    row.bindingProof === null ||
    row.bindingProof === undefined ||
    materializationEnvelope.bindingProof === undefined ||
    canonicalJson(row.bindingProof) !== canonicalJson(materializationEnvelope.bindingProof)
  ) {
    throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  }
  bindingProof = validatePersistedPublicationBindingProof({
    value: row.bindingProof,
    materializationIds,
    tenantScope: parsedScope.value,
    version,
    permissionProjectionVersionId: row.permissionProjectionVersionId,
  });
  const baseCanonicalHash = computeDashboardSnapshotHashV1({
    snapshotId: row.id as never,
    tenantScope: parsedScope.value,
    dashboardVersionId: row.dashboardVersionId as never,
    materializationIds: materializationIds as never,
    inputSelectorHash,
    permissionProjectionVersionId: row.permissionProjectionVersionId as never,
    audience: row.audience as never,
    freshnessState: row.freshnessState as never,
    evidenceState: row.evidenceState as never,
    createdAt: row.createdAt.toISOString() as never,
  });
  const created = createDashboardSnapshotV1({
    snapshotId: row.id,
    tenantScope: parsedScope.value,
    dashboardVersionId: row.dashboardVersionId,
    materializationIds,
    inputSelectorHash,
    permissionProjectionVersionId: row.permissionProjectionVersionId,
    audience: row.audience,
    freshnessState: row.freshnessState,
    evidenceState: row.evidenceState,
    canonicalHash: baseCanonicalHash,
    createdAt: row.createdAt.toISOString(),
    dashboardVersion: version,
  });
  if (!created.accepted) throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  const publicationCanonicalHash = computeDashboardPublicationCanonicalHashV1({
    snapshot: created.value,
    bindingProof,
  });
  if (publicationCanonicalHash !== row.canonicalHash) {
    throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
  }
  return attachDashboardSnapshotBindingProofV1(
    Object.freeze({ ...created.value, canonicalHash: row.canonicalHash }),
    bindingProof,
  );
}

async function replayPublication(
  client: DdaDashboardDraftDatabaseClientV1,
  scope: TenantScopeV1 & {
    readonly scopeType: 'project';
    readonly workspaceId: string;
    readonly projectId: string;
  },
  requestHash: string | undefined,
  row: DashboardPublicationIdempotencyRowV1,
): Promise<DashboardPublicationCommitResultV1> {
  if (requestHash !== undefined && row.requestHash !== requestHash) {
    return { accepted: false, code: 'IDEMPOTENCY_CONFLICT' as const };
  }
  const versionRow = await client.dashboardVersionRecord.findFirst({
    where: {
      id: row.versionId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    },
  });
  if (versionRow === null) throw new Error('DDA_PUBLICATION_REPLAY_MISSING_VERSION');
  const version = versionRow['layoutGraph'] as DashboardVersionV1;
  if (
    version.dashboardId !== row.dashboardId ||
    version.versionId !== row.versionId ||
    projectScopeKey(version.tenantScope) !== projectScopeKey(scope)
  ) {
    throw new Error('DDA_PUBLICATION_REPLAY_SCOPE_INVALID');
  }
  if (version.publicationPolicy === 'DRAFT_ONLY') {
    return { accepted: false, code: 'INVALID_SNAPSHOT' as const };
  }
  const snapshotRow = await client.dashboardSnapshotRecord.findFirst({
    where: {
      id: row.snapshotId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    },
  });
  if (snapshotRow === null) throw new Error('DDA_PUBLICATION_REPLAY_MISSING_SNAPSHOT');
  return {
    accepted: true,
    snapshot: reconstructPublicationSnapshot(snapshotRow, version),
    replayed: true,
    revision: row.revision,
  };
}

function rowToPublicationApprovalInvalidationOutbox(
  row: DashboardPublicationApprovalInvalidationOutboxRecordRowV1,
): DashboardPublicationApprovalInvalidationOutboxRecordV1 {
  const parsedScope = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsedScope.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  if (row.action !== 'INVALIDATE_DASHBOARD_VERSION_PUBLICATION_APPROVALS') {
    throw new Error('DDA_PUBLICATION_INVALIDATION_ACTION_INVALID');
  }
  if (
    row.state !== 'PENDING' &&
    row.state !== 'CLAIMED' &&
    row.state !== 'FAILED' &&
    row.state !== 'COMPLETED'
  ) {
    throw new Error('DDA_PUBLICATION_INVALIDATION_STATE_INVALID');
  }
  return Object.freeze({
    id: row.id,
    keyValue: row.keyValue,
    snapshotId: row.snapshotId,
    dashboardId: row.dashboardId,
    priorPublishedVersionId: row.priorPublishedVersionId,
    tenantScope: parsedScope.value,
    action: 'INVALIDATE_DASHBOARD_VERSION_PUBLICATION_APPROVALS' as const,
    state: row.state,
    attempts: row.attempts ?? 0,
    ...(row.leaseOwner === null ? {} : { leaseOwner: row.leaseOwner }),
    ...(row.leaseExpiresAt === null ? {} : { leaseExpiresAt: row.leaseExpiresAt.toISOString() }),
    ...(row.nextAttemptAt === null ? {} : { nextAttemptAt: row.nextAttemptAt.toISOString() }),
    ...(row.lastError === null ? {} : { lastError: row.lastError }),
    ...(row.completedAt === null ? {} : { completedAt: row.completedAt.toISOString() }),
    createdAt: row.createdAt.toISOString(),
  });
}

export class PrismaDashboardDraftRepositoryAdapter
  implements DashboardDraftRepositoryPortV1, DashboardPublicationApprovalInvalidationOutboxPortV1
{
  public constructor(private readonly client: DdaDashboardDraftDatabaseClientV1) {}

  public async saveIdentity(identity: DashboardDraftIdentityV1): Promise<void> {
    const scope = requireProjectScope(identity.tenantScope);
    const data: DashboardDraftRecordCreateV1 = {
      id: identity.dashboardId,
      scopeType: scope.scopeType,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      titleVi: identity.title.vi,
      titleEn: identity.title.en,
      status: identity.status,
      draftVersionId: identity.draftVersionId ?? null,
      publishedVersionId: identity.publishedVersionId ?? null,
      revision: identity.revision,
    };
    await this.client.dashboardRecord.upsert({
      where: { id: identity.dashboardId },
      create: data,
      update: {
        scopeType: data.scopeType,
        organizationId: data.organizationId,
        workspaceId: data.workspaceId,
        projectId: data.projectId,
        titleVi: data.titleVi,
        titleEn: data.titleEn,
        status: data.status,
        draftVersionId: data.draftVersionId,
        publishedVersionId: data.publishedVersionId,
        revision: data.revision,
      },
    });
  }

  public async findIdentity(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardDraftIdentityV1 | undefined> {
    const scope = requireProjectScope(tenantScope);
    const row = await this.client.dashboardRecord.findFirst({
      where: {
        id: dashboardId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    if (row === null) return undefined;
    const parsed = parseTenantScopeV1({
      scopeType: row.scopeType,
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
    });
    if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
    if (row.status !== 'DRAFT' && row.status !== 'PUBLISHED' && row.status !== 'ARCHIVED') {
      throw new Error('DDA_PERSISTED_DRAFT_INVALID');
    }
    return Object.freeze({
      dashboardId: row.id,
      tenantScope: parsed.value,
      title: Object.freeze({ vi: row.titleVi, en: row.titleEn }),
      status: row.status,
      ...(row.draftVersionId === null ? {} : { draftVersionId: row.draftVersionId }),
      ...(row.publishedVersionId === null ? {} : { publishedVersionId: row.publishedVersionId }),
      revision: row.revision,
    });
  }

  public saveVersion(version: DashboardVersionV1): Promise<void> {
    const scope = requireProjectScope(version.tenantScope);
    return this.client.dashboardVersionRecord
      .create({
        data: {
          id: version.versionId,
          dashboardId: version.dashboardId,
          scopeType: scope.scopeType,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          parentVersionId: version.parentVersionId ?? null,
          layoutGraph: version,
          freshnessPolicy: version.freshnessPolicy,
          publicationPolicy: version.publicationPolicy,
          locale: version.locale,
          timezone: version.timezone,
          canonicalHash: version.canonicalHash,
          createdAt: new Date(version.createdAt),
        },
      })
      .then(() => undefined);
  }

  public async findVersion(
    tenantScope: TenantScopeV1,
    versionId: string,
  ): Promise<DashboardVersionV1 | undefined> {
    const scope = requireProjectScope(tenantScope);
    const row = await this.client.dashboardVersionRecord.findFirst({
      where: {
        id: versionId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    if (row === null) return undefined;
    return row['layoutGraph'] as DashboardVersionV1;
  }

  public async saveRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
    readonly widget: DashboardVersionV1['widgets'][number];
  }): Promise<void> {
    const scope = requireProjectScope(input.tenantScope);
    await this.client.dashboardRemovedWidgetRecord.upsert({
      where: {
        dashboardId_widgetId: {
          dashboardId: input.dashboardId,
          widgetId: input.widgetId,
        },
      },
      create: {
        dashboardId: input.dashboardId,
        widgetId: input.widgetId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        widgetDocument: input.widget,
      },
      update: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        widgetDocument: input.widget,
      },
    });
  }

  public async findRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
  }): Promise<DashboardVersionV1['widgets'][number] | undefined> {
    const scope = requireProjectScope(input.tenantScope);
    const row = await this.client.dashboardRemovedWidgetRecord.findFirst({
      where: {
        dashboardId: input.dashboardId,
        widgetId: input.widgetId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    if (row === null) return undefined;
    return row.widgetDocument as DashboardVersionV1['widgets'][number];
  }

  public async findCommandResult(
    tenantScope: TenantScopeV1,
    commandId: string,
  ): Promise<DashboardAuthoringCommandResultV1 | undefined> {
    const scope = requireProjectScope(tenantScope);
    const row = await this.client.dashboardAuthoringCommandRecord.findFirst({
      where: {
        commandId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    if (row === null) return undefined;
    return row.resultDocument as DashboardAuthoringCommandResultV1;
  }

  public async commitAuthoringVersion(
    input: DashboardAuthoringCommitInputV1,
  ): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly code: 'REVISION_CONFLICT' | 'COMMAND_CONFLICT' }
  > {
    const scope = requireProjectScope(input.tenantScope);
    const commit = async (client: DdaDashboardDraftDatabaseClientV1) => {
      const replay = await client.dashboardAuthoringCommandRecord.findFirst({
        where: {
          commandId: input.commandResult.commandId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
        },
      });
      if (replay !== null) return { accepted: false as const, code: 'COMMAND_CONFLICT' as const };
      const current = await client.dashboardRecord.findFirst({
        where: {
          id: input.identity.dashboardId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
        },
      });
      if (current === null || current.revision !== input.expectedRevision) {
        return { accepted: false as const, code: 'REVISION_CONFLICT' as const };
      }
      const updated = await client.dashboardRecord.updateMany({
        where: {
          id: input.identity.dashboardId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          revision: input.expectedRevision,
        },
        data: {
          draftVersionId: input.version.versionId,
          revision: input.commandResult.revision,
          status: input.identity.status,
        },
      });
      if (updated.count !== 1)
        return { accepted: false as const, code: 'REVISION_CONFLICT' as const };
      await client.dashboardVersionRecord.create({
        data: {
          id: input.version.versionId,
          dashboardId: input.version.dashboardId,
          scopeType: scope.scopeType,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          parentVersionId: input.version.parentVersionId ?? null,
          layoutGraph: input.version,
          freshnessPolicy: input.version.freshnessPolicy,
          publicationPolicy: input.version.publicationPolicy,
          locale: input.version.locale,
          timezone: input.version.timezone,
          canonicalHash: input.version.canonicalHash,
          createdAt: new Date(input.version.createdAt),
        },
      });
      if (input.removedWidget !== undefined) {
        await client.dashboardRemovedWidgetRecord.upsert({
          where: {
            dashboardId_widgetId: {
              dashboardId: input.removedWidget.dashboardId,
              widgetId: input.removedWidget.widgetId,
            },
          },
          create: {
            dashboardId: input.removedWidget.dashboardId,
            widgetId: input.removedWidget.widgetId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            widgetDocument: input.removedWidget.widget,
          },
          update: {
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            widgetDocument: input.removedWidget.widget,
          },
        });
      }
      await client.dashboardAuthoringCommandRecord.create({
        data: {
          commandId: input.commandResult.commandId,
          dashboardId: input.commandResult.dashboardId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          versionId: input.commandResult.versionId,
          revision: input.commandResult.revision,
          savedAt: new Date(input.commandResult.savedAt),
          publishes: false,
          resultDocument: input.commandResult,
        },
      });
      return { accepted: true as const };
    };
    return this.client.$transaction(commit);
  }

  public async findPublicationReplay(
    input: Parameters<NonNullable<DashboardDraftRepositoryPortV1['findPublicationReplay']>>[0],
  ): Promise<DashboardPublicationReplayPreflightResultV1> {
    const scope = requireProjectScope(input.tenantScope);
    const row = await this.client.dashboardPublicationIdempotencyRecord.findFirst({
      where: {
        keyValue: input.idempotencyKey,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    if (row === null) return { kind: 'MISS' };
    if (
      row.dashboardId !== input.dashboardId ||
      row.versionId !== input.versionId ||
      row.revision !== input.expectedRevision + 1
    ) {
      return { kind: 'CONFLICT' };
    }
    const replay = await replayPublication(this.client, scope, undefined, row);
    if (!replay.accepted && replay.code === 'INVALID_SNAPSHOT') {
      return { kind: 'INVALID' };
    }
    if (!replay.accepted || replay.snapshot.audience !== input.audience) {
      return { kind: 'CONFLICT' };
    }
    return { kind: 'REPLAY', snapshot: replay.snapshot, revision: replay.revision };
  }

  public async listPendingTenantScopes(input: {
    readonly now: Date;
    readonly limit: number;
  }): Promise<readonly TenantScopeV1[]> {
    const rows = await this.client.dashboardPublicationApprovalInvalidationOutboxRecord.findMany({
      where: {
        OR: [
          {
            state: 'PENDING',
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: input.now } }],
          },
          { state: 'FAILED', nextAttemptAt: { lte: input.now } },
          { state: 'CLAIMED', leaseExpiresAt: { lte: input.now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: Math.max(1, input.limit) * 8,
    });
    const scopes = new Map<string, TenantScopeV1>();
    for (const row of rows) {
      const parsed = parseTenantScopeV1({
        scopeType: row.scopeType,
        organizationId: row.organizationId,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
      });
      if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
      scopes.set(projectScopeKey(parsed.value), parsed.value);
      if (scopes.size >= Math.max(1, input.limit)) break;
    }
    return Object.freeze([...scopes.values()]);
  }

  public async claimNext(
    input: Parameters<DashboardPublicationApprovalInvalidationOutboxPortV1['claimNext']>[0],
  ): ReturnType<DashboardPublicationApprovalInvalidationOutboxPortV1['claimNext']> {
    const scope = requireProjectScope(input.tenantScope);
    const row = await this.client.dashboardPublicationApprovalInvalidationOutboxRecord.findFirst({
      where: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        OR: [
          {
            state: 'PENDING',
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: input.now } }],
          },
          { state: 'FAILED', nextAttemptAt: { lte: input.now } },
          { state: 'CLAIMED', leaseExpiresAt: { lte: input.now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (row === null) return { accepted: true };
    const nextAttempts = (row.attempts ?? 0) + 1;
    const leaseExpiresAt = new Date(input.now.getTime() + Math.max(1, input.leaseDurationMs));
    const claimed =
      await this.client.dashboardPublicationApprovalInvalidationOutboxRecord.updateMany({
        where: {
          id: row.id,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          state: row.state,
          ...(row.state === 'CLAIMED' && row.leaseOwner !== null
            ? { leaseOwner: row.leaseOwner }
            : {}),
        },
        data: {
          state: 'CLAIMED',
          leaseOwner: input.workerId,
          leaseExpiresAt,
          attempts: { increment: 1 },
        },
      });
    if (claimed.count !== 1) return { accepted: false, code: 'UNAVAILABLE' };
    return {
      accepted: true,
      record: rowToPublicationApprovalInvalidationOutbox({
        ...row,
        state: 'CLAIMED',
        attempts: nextAttempts,
        leaseOwner: input.workerId,
        leaseExpiresAt,
      }),
    };
  }

  public async markCompleted(
    input: Parameters<DashboardPublicationApprovalInvalidationOutboxPortV1['markCompleted']>[0],
  ): ReturnType<DashboardPublicationApprovalInvalidationOutboxPortV1['markCompleted']> {
    const scope = requireProjectScope(input.tenantScope);
    const updated =
      await this.client.dashboardPublicationApprovalInvalidationOutboxRecord.updateMany({
        where: {
          id: input.recordId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          state: 'CLAIMED',
          leaseOwner: input.workerId,
        },
        data: {
          state: 'COMPLETED',
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: input.now,
        },
      });
    return updated.count === 1 ? { accepted: true } : { accepted: false, code: 'LEASE_CONFLICT' };
  }

  public async markFailed(
    input: Parameters<DashboardPublicationApprovalInvalidationOutboxPortV1['markFailed']>[0],
  ): ReturnType<DashboardPublicationApprovalInvalidationOutboxPortV1['markFailed']> {
    const scope = requireProjectScope(input.tenantScope);
    const updated =
      await this.client.dashboardPublicationApprovalInvalidationOutboxRecord.updateMany({
        where: {
          id: input.recordId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          state: 'CLAIMED',
          leaseOwner: input.workerId,
        },
        data: {
          state: 'FAILED',
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: input.retryAt,
          lastError: input.error.slice(0, 512),
        },
      });
    return updated.count === 1 ? { accepted: true } : { accepted: false, code: 'LEASE_CONFLICT' };
  }

  public async commitPublication(
    input: DashboardPublicationCommitInputV1,
  ): Promise<DashboardPublicationCommitResultV1> {
    const scope = requireProjectScope(input.tenantScope);
    const requestHash = computeDashboardPublicationRequestHashV1(input);
    const idempotencyWhere = {
      keyValue: input.idempotencyKey,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    };
    const commit = async (
      client: DdaDashboardDraftDatabaseClientV1,
    ): Promise<DashboardPublicationCommitResultV1> => {
      const replay = (row: DashboardPublicationIdempotencyRowV1) =>
        replayPublication(client, scope, requestHash, row);

      const existing = await client.dashboardPublicationIdempotencyRecord.findFirst({
        where: idempotencyWhere,
      });
      if (existing !== null) return replay(existing);

      const identity = await client.dashboardRecord.findFirst({
        where: {
          id: input.dashboardId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
        },
      });
      if (identity === null) return { accepted: false, code: 'VERSION_NOT_FOUND' as const };

      const versionRow = await client.dashboardVersionRecord.findFirst({
        where: {
          id: input.versionId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
        },
      });
      if (versionRow === null) return { accepted: false, code: 'VERSION_NOT_FOUND' as const };
      const version = versionRow['layoutGraph'] as DashboardVersionV1;
      if (
        version.dashboardId !== input.dashboardId ||
        version.versionId !== input.versionId ||
        projectScopeKey(version.tenantScope) !== projectScopeKey(scope)
      ) {
        return { accepted: false, code: 'VERSION_NOT_FOUND' as const };
      }
      if (identity.revision !== input.expectedRevision) {
        return { accepted: false, code: 'REVISION_CONFLICT' as const };
      }
      if ((input.audience as string) === 'SHARED_LINK') {
        return { accepted: false, code: 'INVALID_SNAPSHOT' as const };
      }
      if (
        input.approvalInvalidation !== undefined &&
        (input.approvalInvalidation.dashboardId !== input.dashboardId ||
          input.approvalInvalidation.priorPublishedVersionId !== identity.publishedVersionId ||
          projectScopeKey(input.approvalInvalidation.tenantScope) !== projectScopeKey(scope))
      ) {
        return { accepted: false, code: 'INVALID_SNAPSHOT' as const };
      }
      if (input.approvalInvalidation !== undefined) {
        const priorVersionRow = await client.dashboardVersionRecord.findFirst({
          where: {
            id: input.approvalInvalidation.priorPublishedVersionId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
          },
        });
        if (
          priorVersionRow === null ||
          (priorVersionRow['layoutGraph'] as DashboardVersionV1).dashboardId !==
            input.dashboardId ||
          (priorVersionRow['layoutGraph'] as DashboardVersionV1).versionId !==
            input.approvalInvalidation.priorPublishedVersionId ||
          projectScopeKey((priorVersionRow['layoutGraph'] as DashboardVersionV1).tenantScope) !==
            projectScopeKey(scope)
        ) {
          return { accepted: false, code: 'INVALID_SNAPSHOT' as const };
        }
      }

      const projection = validateDashboardPublicationResolvedProjectionV1({
        tenantScope: input.tenantScope,
        version,
        projection: input.resolvedProjection,
      });
      if (!projection.accepted) {
        return { accepted: false, code: 'INVALID_SNAPSHOT' as const };
      }

      const created = createPublicationSnapshot(
        { ...input, resolvedProjection: projection.value },
        version,
      );
      if (!created.accepted) return { accepted: false, code: 'INVALID_SNAPSHOT' as const };
      const revision = identity.revision + 1;
      const updated = await client.dashboardRecord.updateMany({
        where: {
          id: input.dashboardId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          revision: input.expectedRevision,
        },
        data: {
          publishedVersionId: version.versionId,
          status: 'PUBLISHED',
          revision,
        },
      });
      if (updated.count !== 1) {
        const concurrent = await client.dashboardPublicationIdempotencyRecord.findFirst({
          where: idempotencyWhere,
        });
        if (concurrent !== null) return replay(concurrent);
        return { accepted: false, code: 'REVISION_CONFLICT' as const };
      }

      await client.dashboardSnapshotRecord.create({
        data: {
          id: created.value.snapshotId,
          scopeType: scope.scopeType,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          dashboardVersionId: created.value.dashboardVersionId,
          materializationIds: {
            version: 1,
            bindingProofVersion: 1,
            ids: created.value.materializationIds,
            inputSelectorHash: created.value.inputSelectorHash,
            bindingProof: projection.value.bindingProof,
          },
          bindingProof: projection.value.bindingProof,
          bindingProofVersion: 1,
          inputSelectorHash: created.value.inputSelectorHash,
          permissionProjectionVersionId: created.value.permissionProjectionVersionId,
          audience: created.value.audience,
          freshnessState: created.value.freshnessState,
          evidenceState: created.value.evidenceState,
          evidenceReferenceId: null,
          canonicalHash: created.value.canonicalHash,
          createdAt: new Date(created.value.createdAt),
        },
      });
      await client.dashboardPublicationIdempotencyRecord.create({
        data: {
          keyValue: input.idempotencyKey,
          snapshotId: created.value.snapshotId,
          dashboardId: input.dashboardId,
          versionId: input.versionId,
          requestHash,
          revision,
          scopeType: scope.scopeType,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          createdAt: new Date(created.value.createdAt),
        },
      });
      await client.dashboardRefreshStateRecord.upsert({
        where: {
          organizationId_workspaceId_projectId_dashboardId: {
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            dashboardId: input.dashboardId,
          },
        },
        create: {
          id: input.dashboardId,
          dashboardId: input.dashboardId,
          scopeType: scope.scopeType,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          freshnessPolicy: version.freshnessPolicy,
          lastSnapshotId: created.value.snapshotId,
          lastJobId: null,
          status: 'CURRENT',
          reasonCode: null,
        },
        update: {
          scopeType: scope.scopeType,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          freshnessPolicy: version.freshnessPolicy,
          lastSnapshotId: created.value.snapshotId,
          lastJobId: null,
          status: 'CURRENT',
          reasonCode: null,
        },
      });
      await client.dashboardPublicationAuditOutboxRecord.create({
        data: {
          id: created.value.snapshotId,
          keyValue: input.idempotencyKey,
          dashboardId: input.dashboardId,
          versionId: input.versionId,
          snapshotId: created.value.snapshotId,
          actorId: input.auditMetadata.actorId,
          correlationId: input.auditMetadata.correlationId,
          authorizationEpoch: input.auditMetadata.authorizationEpoch,
          approvalId: input.auditMetadata.approvalId ?? null,
          priorPublishedVersionId: input.approvalInvalidation?.priorPublishedVersionId ?? null,
          audience: input.audience,
          action: 'DASHBOARD_PUBLISH',
          createdAt: new Date(created.value.createdAt),
          scopeType: scope.scopeType,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
        },
      });
      if (input.approvalInvalidation !== undefined) {
        await client.dashboardPublicationApprovalInvalidationOutboxRecord.create({
          data: {
            id: created.value.snapshotId,
            keyValue: input.idempotencyKey,
            snapshotId: created.value.snapshotId,
            dashboardId: input.dashboardId,
            priorPublishedVersionId: input.approvalInvalidation.priorPublishedVersionId,
            scopeType: scope.scopeType,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            action: 'INVALIDATE_DASHBOARD_VERSION_PUBLICATION_APPROVALS',
            state: 'PENDING',
            attempts: 0,
            leaseOwner: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            lastError: null,
            completedAt: null,
            createdAt: new Date(created.value.createdAt),
          },
        });
      }
      return { accepted: true, snapshot: created.value, replayed: false, revision };
    };
    try {
      const result = await this.client.$transaction(commit);
      if (!result.accepted && result.code === 'REVISION_CONFLICT') {
        const concurrent = await this.client.dashboardPublicationIdempotencyRecord.findFirst({
          where: idempotencyWhere,
        });
        if (concurrent !== null)
          return replayPublication(this.client, scope, requestHash, concurrent);
      }
      return result;
    } catch (error) {
      const concurrent = await this.client.dashboardPublicationIdempotencyRecord.findFirst({
        where: idempotencyWhere,
      });
      if (concurrent !== null) {
        return replayPublication(this.client, scope, requestHash, concurrent);
      }
      throw error;
    }
  }
}
