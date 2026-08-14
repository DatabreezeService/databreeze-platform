import {
  computeDashboardSnapshotHashV1,
  createDashboardSnapshotV1,
  type DashboardSnapshotV1,
  type DashboardVersionV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { randomUUID } from 'node:crypto';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  computeDashboardPublicationCanonicalHashV1,
  computeDashboardPublicationInputSelectorHashV1,
  computeDashboardPublicationRequestHashV1,
  attachDashboardSnapshotBindingProofV1,
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
import type { DashboardPublicationApprovalInvalidationOutboxPortV1 } from '../application/dashboard-publication-approval-invalidation-outbox.port.js';
import type { DashboardPublicationApprovalInvalidationOutboxRecordV1 } from '../application/dashboard-publication-approval-invalidation-outbox.port.js';

function scopeKey(tenantScope: TenantScopeV1, id: string): string {
  const workspace = 'workspaceId' in tenantScope ? tenantScope.workspaceId : '';
  const project = 'projectId' in tenantScope ? tenantScope.projectId : '';
  return `${tenantScope.scopeType}|${tenantScope.organizationId}|${workspace}|${project}|${id}`;
}

function publicationKey(tenantScope: TenantScopeV1, idempotencyKey: string): string {
  return scopeKey(tenantScope, `publication:${idempotencyKey}`);
}

function publicationTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, '.000Z');
}

interface InMemoryPublicationIdempotencyV1 {
  readonly requestHash: string;
  readonly snapshotId: string;
  readonly dashboardId: string;
  readonly versionId: string;
  readonly audience: DashboardPublicationCommitInputV1['audience'];
  readonly revision: number;
}

interface InMemoryPublicationAuditOutboxV1 {
  readonly tenantScope: TenantScopeV1;
  readonly idempotencyKey: string;
  readonly dashboardId: string;
  readonly versionId: string;
  readonly snapshotId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly authorizationEpoch: number;
  readonly approvalId?: string;
  readonly priorPublishedVersionId?: string;
}

interface InMemoryDashboardRefreshStateV1 {
  readonly dashboardId: string;
  readonly tenantScope: TenantScopeV1;
  readonly freshnessPolicy: DashboardVersionV1['freshnessPolicy'];
  readonly lastSnapshotId: string;
  readonly status: 'CURRENT';
}

type InMemoryPublicationApprovalInvalidationOutboxV1 =
  DashboardPublicationApprovalInvalidationOutboxRecordV1 & { readonly idempotencyKey: string };

export class InMemoryDashboardDraftRepositoryAdapter
  implements DashboardDraftRepositoryPortV1, DashboardPublicationApprovalInvalidationOutboxPortV1
{
  readonly #identities = new Map<string, DashboardDraftIdentityV1>();
  readonly #versions = new Map<string, DashboardVersionV1>();
  readonly #removed = new Map<string, DashboardVersionV1['widgets'][number]>();
  readonly #commands = new Map<string, DashboardAuthoringCommandResultV1>();
  readonly #snapshots = new Map<string, DashboardSnapshotV1>();
  readonly #publicationBindingProofs = new Map<
    string,
    DashboardPublicationCommitInputV1['resolvedProjection']['bindingProof']
  >();
  readonly #publicationIdempotency = new Map<string, InMemoryPublicationIdempotencyV1>();
  readonly #refreshStates = new Map<string, InMemoryDashboardRefreshStateV1>();
  readonly #publicationAuditOutbox: InMemoryPublicationAuditOutboxV1[] = [];
  readonly #publicationApprovalInvalidationOutbox = new Map<
    string,
    InMemoryPublicationApprovalInvalidationOutboxV1
  >();

  public saveIdentity(identity: DashboardDraftIdentityV1): Promise<void> {
    this.#identities.set(
      scopeKey(identity.tenantScope, identity.dashboardId),
      Object.freeze({ ...identity }),
    );
    return Promise.resolve();
  }

  public findIdentity(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): Promise<DashboardDraftIdentityV1 | undefined> {
    return Promise.resolve(this.#identities.get(scopeKey(tenantScope, dashboardId)));
  }

  public saveVersion(version: DashboardVersionV1): Promise<void> {
    this.#versions.set(scopeKey(version.tenantScope, version.versionId), version);
    return Promise.resolve();
  }

  public findVersion(
    tenantScope: TenantScopeV1,
    versionId: string,
  ): Promise<DashboardVersionV1 | undefined> {
    return Promise.resolve(this.#versions.get(scopeKey(tenantScope, versionId)));
  }

  public saveRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
    readonly widget: DashboardVersionV1['widgets'][number];
  }): Promise<void> {
    this.#removed.set(
      `${scopeKey(input.tenantScope, input.dashboardId)}|${input.widgetId}`,
      input.widget,
    );
    return Promise.resolve();
  }

  public findRemovedWidget(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly widgetId: string;
  }): Promise<DashboardVersionV1['widgets'][number] | undefined> {
    return Promise.resolve(
      this.#removed.get(`${scopeKey(input.tenantScope, input.dashboardId)}|${input.widgetId}`),
    );
  }

  public findCommandResult(
    tenantScope: TenantScopeV1,
    commandId: string,
  ): Promise<DashboardAuthoringCommandResultV1 | undefined> {
    return Promise.resolve(this.#commands.get(scopeKey(tenantScope, `command:${commandId}`)));
  }

  public commitAuthoringVersion(
    input: DashboardAuthoringCommitInputV1,
  ): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly code: 'REVISION_CONFLICT' | 'COMMAND_CONFLICT' }
  > {
    const commandKey = scopeKey(input.tenantScope, `command:${input.commandResult.commandId}`);
    if (this.#commands.has(commandKey)) {
      return Promise.resolve({ accepted: false, code: 'COMMAND_CONFLICT' as const });
    }
    const identityKey = scopeKey(input.tenantScope, input.identity.dashboardId);
    const current = this.#identities.get(identityKey);
    if (current === undefined || current.revision !== input.expectedRevision) {
      return Promise.resolve({ accepted: false, code: 'REVISION_CONFLICT' as const });
    }
    this.#versions.set(scopeKey(input.tenantScope, input.version.versionId), input.version);
    if (input.removedWidget !== undefined) {
      this.#removed.set(
        `${scopeKey(input.tenantScope, input.removedWidget.dashboardId)}|${input.removedWidget.widgetId}`,
        input.removedWidget.widget,
      );
    }
    this.#identities.set(
      identityKey,
      Object.freeze({
        ...input.identity,
        draftVersionId: input.version.versionId,
        revision: input.commandResult.revision,
      }),
    );
    this.#commands.set(commandKey, Object.freeze({ ...input.commandResult }));
    return Promise.resolve({ accepted: true as const });
  }

  public commitPublication(
    input: DashboardPublicationCommitInputV1,
  ): Promise<DashboardPublicationCommitResultV1> {
    const idempotencyKey = publicationKey(input.tenantScope, input.idempotencyKey);
    const requestHash = computeDashboardPublicationRequestHashV1(input);
    const replay = this.#publicationIdempotency.get(idempotencyKey);
    if (replay !== undefined) {
      if (replay.requestHash !== requestHash) {
        return Promise.resolve({ accepted: false, code: 'IDEMPOTENCY_CONFLICT' as const });
      }
      const version = this.#versions.get(scopeKey(input.tenantScope, replay.versionId));
      if (version?.publicationPolicy === 'DRAFT_ONLY') {
        return Promise.resolve({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
      }
      const snapshot = this.#snapshots.get(scopeKey(input.tenantScope, replay.snapshotId));
      if (snapshot === undefined) throw new Error('DDA_PUBLICATION_REPLAY_MISSING_SNAPSHOT');
      const bindingProof = this.#publicationBindingProofs.get(
        scopeKey(input.tenantScope, replay.snapshotId),
      );
      if (
        bindingProof === undefined ||
        computeDashboardPublicationCanonicalHashV1({ snapshot, bindingProof }) !==
          snapshot.canonicalHash
      ) {
        throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
      }
      return Promise.resolve({
        accepted: true as const,
        snapshot,
        replayed: true as const,
        revision: replay.revision,
      });
    }

    const identityKey = scopeKey(input.tenantScope, input.dashboardId);
    const identity = this.#identities.get(identityKey);
    if (identity === undefined) {
      return Promise.resolve({ accepted: false, code: 'VERSION_NOT_FOUND' as const });
    }
    const version = this.#versions.get(scopeKey(input.tenantScope, input.versionId));
    if (
      version === undefined ||
      version.dashboardId !== input.dashboardId ||
      scopeKey(version.tenantScope, '') !== scopeKey(input.tenantScope, '')
    ) {
      return Promise.resolve({ accepted: false, code: 'VERSION_NOT_FOUND' as const });
    }
    if (identity.revision !== input.expectedRevision) {
      return Promise.resolve({ accepted: false, code: 'REVISION_CONFLICT' as const });
    }
    if ((input.audience as string) === 'SHARED_LINK') {
      return Promise.resolve({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }
    if (
      input.approvalInvalidation !== undefined &&
      (input.approvalInvalidation.dashboardId !== input.dashboardId ||
        input.approvalInvalidation.priorPublishedVersionId !== identity.publishedVersionId ||
        scopeKey(input.approvalInvalidation.tenantScope, '') !== scopeKey(input.tenantScope, ''))
    ) {
      return Promise.resolve({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }
    if (input.approvalInvalidation !== undefined) {
      const priorVersion = this.#versions.get(
        scopeKey(input.tenantScope, input.approvalInvalidation.priorPublishedVersionId),
      );
      if (
        priorVersion === undefined ||
        priorVersion.dashboardId !== input.dashboardId ||
        priorVersion.versionId !== input.approvalInvalidation.priorPublishedVersionId ||
        scopeKey(priorVersion.tenantScope, '') !== scopeKey(input.tenantScope, '')
      ) {
        return Promise.resolve({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
      }
    }

    const projection = validateDashboardPublicationResolvedProjectionV1({
      tenantScope: input.tenantScope,
      version,
      projection: input.resolvedProjection,
    });
    if (!projection.accepted) {
      return Promise.resolve({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }

    const snapshotId = randomUUID();
    const createdAt = publicationTimestamp();
    const materializations = projection.value.materializations;
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
      freshnessState: projection.value.freshnessState,
      evidenceState: projection.value.evidenceState,
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
      freshnessState: projection.value.freshnessState,
      evidenceState: projection.value.evidenceState,
      canonicalHash: baseCanonicalHash,
      createdAt,
      dashboardVersion: version,
      materializations,
    });
    if (!created.accepted) {
      return Promise.resolve({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }
    const snapshot = attachDashboardSnapshotBindingProofV1(
      Object.freeze({
        ...created.value,
        canonicalHash: computeDashboardPublicationCanonicalHashV1({
          snapshot: created.value,
          bindingProof: projection.value.bindingProof,
        }),
      }),
      projection.value.bindingProof,
    );

    const revision = identity.revision + 1;
    this.#snapshots.set(scopeKey(input.tenantScope, snapshot.snapshotId), snapshot);
    this.#publicationBindingProofs.set(
      scopeKey(input.tenantScope, snapshot.snapshotId),
      Object.freeze([...projection.value.bindingProof]),
    );
    this.#identities.set(
      identityKey,
      Object.freeze({
        ...identity,
        status: 'PUBLISHED',
        publishedVersionId: version.versionId,
        revision,
      }),
    );
    this.#refreshStates.set(
      identityKey,
      Object.freeze({
        dashboardId: input.dashboardId,
        tenantScope: input.tenantScope,
        freshnessPolicy: version.freshnessPolicy,
        lastSnapshotId: snapshot.snapshotId,
        status: 'CURRENT' as const,
      }),
    );
    this.#publicationIdempotency.set(
      idempotencyKey,
      Object.freeze({
        requestHash,
        snapshotId: snapshot.snapshotId,
        dashboardId: input.dashboardId,
        versionId: input.versionId,
        audience: input.audience,
        revision,
      }),
    );
    this.#publicationAuditOutbox.push(
      Object.freeze({
        tenantScope: input.tenantScope,
        idempotencyKey: input.idempotencyKey,
        dashboardId: input.dashboardId,
        versionId: input.versionId,
        snapshotId: snapshot.snapshotId,
        ...input.auditMetadata,
        ...(input.approvalInvalidation === undefined
          ? {}
          : {
              priorPublishedVersionId: input.approvalInvalidation.priorPublishedVersionId,
            }),
      }),
    );
    if (input.approvalInvalidation !== undefined) {
      const invalidationKey = `${idempotencyKey}|${input.approvalInvalidation.priorPublishedVersionId}`;
      this.#publicationApprovalInvalidationOutbox.set(
        invalidationKey,
        Object.freeze({
          id: `${input.idempotencyKey}|${input.approvalInvalidation.priorPublishedVersionId}`,
          keyValue: invalidationKey,
          tenantScope: input.tenantScope,
          idempotencyKey: input.idempotencyKey,
          snapshotId: snapshot.snapshotId,
          dashboardId: input.dashboardId,
          priorPublishedVersionId: input.approvalInvalidation.priorPublishedVersionId,
          action: 'INVALIDATE_DASHBOARD_VERSION_PUBLICATION_APPROVALS' as const,
          state: 'PENDING' as const,
          attempts: 0,
          createdAt: created.value.createdAt,
        }),
      );
    }
    return Promise.resolve({
      accepted: true as const,
      snapshot,
      replayed: false as const,
      revision,
    });
  }

  public findPublicationReplay(
    input: Parameters<NonNullable<DashboardDraftRepositoryPortV1['findPublicationReplay']>>[0],
  ): Promise<DashboardPublicationReplayPreflightResultV1> {
    const row = this.#publicationIdempotency.get(
      publicationKey(input.tenantScope, input.idempotencyKey),
    );
    if (row === undefined) return Promise.resolve({ kind: 'MISS' as const });
    if (
      row.dashboardId !== input.dashboardId ||
      row.versionId !== input.versionId ||
      row.audience !== input.audience ||
      row.revision !== input.expectedRevision + 1
    ) {
      return Promise.resolve({ kind: 'CONFLICT' as const });
    }
    const version = this.#versions.get(scopeKey(input.tenantScope, row.versionId));
    if (version?.publicationPolicy === 'DRAFT_ONLY') {
      return Promise.resolve({ kind: 'INVALID' as const });
    }
    const snapshot = this.#snapshots.get(scopeKey(input.tenantScope, row.snapshotId));
    if (snapshot === undefined) throw new Error('DDA_PUBLICATION_REPLAY_MISSING_SNAPSHOT');
    const bindingProof = this.#publicationBindingProofs.get(
      scopeKey(input.tenantScope, row.snapshotId),
    );
    if (
      bindingProof === undefined ||
      computeDashboardPublicationCanonicalHashV1({ snapshot, bindingProof }) !==
        snapshot.canonicalHash
    ) {
      throw new Error('DDA_PERSISTED_SNAPSHOT_INVALID');
    }
    return Promise.resolve({ kind: 'REPLAY' as const, snapshot, revision: row.revision });
  }

  public findRefreshState(
    tenantScope: TenantScopeV1,
    dashboardId: string,
  ): InMemoryDashboardRefreshStateV1 | undefined {
    return this.#refreshStates.get(scopeKey(tenantScope, dashboardId));
  }

  public findPublicationAuditOutbox(): readonly InMemoryPublicationAuditOutboxV1[] {
    return Object.freeze([...this.#publicationAuditOutbox]);
  }

  public findPublicationApprovalInvalidationOutbox(): readonly InMemoryPublicationApprovalInvalidationOutboxV1[] {
    return Object.freeze([...this.#publicationApprovalInvalidationOutbox.values()]);
  }

  public listPendingTenantScopes(input: {
    readonly now: Date;
    readonly limit: number;
  }): Promise<readonly TenantScopeV1[]> {
    const scopes = new Map<string, TenantScopeV1>();
    for (const row of this.#publicationApprovalInvalidationOutbox.values()) {
      if (row.state === 'COMPLETED') continue;
      if (
        row.state === 'CLAIMED' &&
        (row.leaseExpiresAt === undefined || Date.parse(row.leaseExpiresAt) > input.now.getTime())
      ) {
        continue;
      }
      if (row.nextAttemptAt !== undefined && Date.parse(row.nextAttemptAt) > input.now.getTime()) {
        continue;
      }
      scopes.set(scopeKey(row.tenantScope, ''), row.tenantScope);
      if (scopes.size >= Math.max(1, input.limit)) break;
    }
    return Promise.resolve(Object.freeze([...scopes.values()]));
  }

  public claimNext(
    input: Parameters<DashboardPublicationApprovalInvalidationOutboxPortV1['claimNext']>[0],
  ): ReturnType<DashboardPublicationApprovalInvalidationOutboxPortV1['claimNext']> {
    const now = input.now.getTime();
    const candidate = [...this.#publicationApprovalInvalidationOutbox.entries()]
      .filter(([, row]) => scopeKey(row.tenantScope, '') === scopeKey(input.tenantScope, ''))
      .sort(([, left], [, right]) => left.createdAt.localeCompare(right.createdAt))
      .find(([, row]) => {
        if (row.state === 'COMPLETED') return false;
        if (row.state === 'CLAIMED') {
          return row.leaseExpiresAt !== undefined && Date.parse(row.leaseExpiresAt) <= now;
        }
        return row.nextAttemptAt === undefined || Date.parse(row.nextAttemptAt) <= now;
      });
    if (candidate === undefined) return Promise.resolve({ accepted: true as const });
    const [key, row] = candidate;
    const claimed: InMemoryPublicationApprovalInvalidationOutboxV1 = Object.freeze({
      ...row,
      state: 'CLAIMED' as const,
      attempts: row.attempts + 1,
      leaseOwner: input.workerId,
      leaseExpiresAt: new Date(now + Math.max(1, input.leaseDurationMs)).toISOString(),
    });
    this.#publicationApprovalInvalidationOutbox.set(key, claimed);
    return Promise.resolve({ accepted: true as const, record: claimed });
  }

  public markCompleted(
    input: Parameters<DashboardPublicationApprovalInvalidationOutboxPortV1['markCompleted']>[0],
  ): ReturnType<DashboardPublicationApprovalInvalidationOutboxPortV1['markCompleted']> {
    const entry = [...this.#publicationApprovalInvalidationOutbox.entries()].find(
      ([, row]) =>
        row.id === input.recordId &&
        scopeKey(row.tenantScope, '') === scopeKey(input.tenantScope, ''),
    );
    if (entry === undefined)
      return Promise.resolve({ accepted: false as const, code: 'NOT_FOUND' as const });
    const [key, row] = entry;
    if (row.state !== 'CLAIMED' || row.leaseOwner !== input.workerId) {
      return Promise.resolve({ accepted: false as const, code: 'LEASE_CONFLICT' as const });
    }
    const { leaseOwner: _leaseOwner, leaseExpiresAt: _leaseExpiresAt, ...withoutLease } = row;
    void _leaseOwner;
    void _leaseExpiresAt;
    this.#publicationApprovalInvalidationOutbox.set(
      key,
      Object.freeze({
        ...withoutLease,
        state: 'COMPLETED' as const,
        completedAt: input.now.toISOString(),
      }),
    );
    return Promise.resolve({ accepted: true as const });
  }

  public markFailed(
    input: Parameters<DashboardPublicationApprovalInvalidationOutboxPortV1['markFailed']>[0],
  ): ReturnType<DashboardPublicationApprovalInvalidationOutboxPortV1['markFailed']> {
    const entry = [...this.#publicationApprovalInvalidationOutbox.entries()].find(
      ([, row]) =>
        row.id === input.recordId &&
        scopeKey(row.tenantScope, '') === scopeKey(input.tenantScope, ''),
    );
    if (entry === undefined)
      return Promise.resolve({ accepted: false as const, code: 'NOT_FOUND' as const });
    const [key, row] = entry;
    if (row.state !== 'CLAIMED' || row.leaseOwner !== input.workerId) {
      return Promise.resolve({ accepted: false as const, code: 'LEASE_CONFLICT' as const });
    }
    const { leaseOwner: _leaseOwner, leaseExpiresAt: _leaseExpiresAt, ...withoutLease } = row;
    void _leaseOwner;
    void _leaseExpiresAt;
    this.#publicationApprovalInvalidationOutbox.set(
      key,
      Object.freeze({
        ...withoutLease,
        state: 'FAILED' as const,
        nextAttemptAt: input.retryAt.toISOString(),
        lastError: input.error.slice(0, 512),
      }),
    );
    return Promise.resolve({ accepted: true as const });
  }
}
