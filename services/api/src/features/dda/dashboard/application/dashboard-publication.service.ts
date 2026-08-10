import {
  computeDashboardSnapshotHashV1,
  createDashboardSnapshotV1,
  type DashboardSnapshotV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { createHash, randomUUID } from 'node:crypto';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { DashboardDraftRepositoryPortV1 } from './dashboard-repository.port.js';
import type { DashboardAuthorizationPortV1 } from './dashboard-authorization.port.js';

export type DashboardPublicationErrorV1 =
  | 'UNAUTHORIZED'
  | 'VERSION_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'APPROVAL_INVALIDATED'
  | 'INVALID_SNAPSHOT';

export type DashboardPublicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DashboardPublicationErrorV1 };

/** DDA-025: separate publish command with idempotency and approval invalidation. */
export class DashboardPublicationServiceV1 {
  readonly #idempotency = new Map<string, DashboardSnapshotV1>();
  readonly #audit: { readonly action: string; readonly summary: string }[] = [];

  public constructor(
    private readonly repository: DashboardDraftRepositoryPortV1,
    private readonly authorization: DashboardAuthorizationPortV1,
  ) {}

  public getAuditTrail(): readonly { readonly action: string; readonly summary: string }[] {
    return this.#audit;
  }

  public async publish(
    context: IamTenantContextV1,
    input: {
      readonly dashboardId: string;
      readonly versionId: string;
      readonly audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS' | 'SHARED_LINK';
      readonly materializationIds: readonly string[];
      readonly permissionProjectionVersionId: string;
      readonly expectedRevision: number;
      readonly idempotencyKey: string;
      readonly approvalId?: string;
      readonly materialChange?: boolean;
    },
  ): Promise<DashboardPublicationResultV1<DashboardSnapshotV1>> {
    const auth = await this.authorization.authorizeDashboardAction({
      tenantScope: context.tenantScope,
      actorId: context.actorId,
      dashboardId: input.dashboardId,
      action: 'PUBLISH',
    });
    if (!auth.allowed) return Object.freeze({ accepted: false, code: 'UNAUTHORIZED' as const });

    const cached = this.#idempotency.get(input.idempotencyKey);
    if (cached) return Object.freeze({ accepted: true, value: cached });

    const identity = await this.repository.findIdentity(context.tenantScope, input.dashboardId);
    if (!identity) return Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });

    if (input.materialChange === true && input.approvalId) {
      this.#audit.push({
        action: 'approval.invalidate',
        summary: 'material-change-invalidated-approval',
      });
      return Object.freeze({ accepted: false, code: 'APPROVAL_INVALIDATED' as const });
    }

    if (identity.revision !== input.expectedRevision) {
      return Object.freeze({ accepted: false, code: 'REVISION_CONFLICT' as const });
    }

    const version = await this.repository.findVersion(context.tenantScope, input.versionId);
    if (!version) return Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });
    void version;

    const snapshotId = randomUUID();
    const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/u, '.000Z');
    const inputSelectorHash = createHash('sha256')
      .update(JSON.stringify({ versionId: input.versionId, mats: input.materializationIds }))
      .digest('hex');
    const canonicalHash = computeDashboardSnapshotHashV1({
      snapshotId: snapshotId as never,
      tenantScope: context.tenantScope,
      dashboardVersionId: input.versionId as never,
      materializationIds: input.materializationIds as never,
      inputSelectorHash,
      permissionProjectionVersionId: input.permissionProjectionVersionId as never,
      audience: input.audience,
      freshnessState: 'FRESH',
      evidenceState: 'AVAILABLE',
      createdAt: createdAt as never,
    });
    const created = createDashboardSnapshotV1({
      snapshotId,
      tenantScope: context.tenantScope,
      dashboardVersionId: input.versionId,
      materializationIds: input.materializationIds,
      inputSelectorHash,
      permissionProjectionVersionId: input.permissionProjectionVersionId,
      audience: input.audience,
      freshnessState: 'FRESH',
      evidenceState: 'AVAILABLE',
      canonicalHash,
      createdAt,
    });
    if (!created.accepted) {
      return Object.freeze({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }

    await this.repository.saveIdentity({
      ...identity,
      status: 'PUBLISHED',
      publishedVersionId: input.versionId,
      revision: identity.revision + 1,
    });
    this.#idempotency.set(input.idempotencyKey, created.value);
    this.#audit.push({
      action: 'dashboard.publish',
      summary: 'published-snapshot-content-safe',
    });
    return Object.freeze({ accepted: true, value: created.value });
  }
}
